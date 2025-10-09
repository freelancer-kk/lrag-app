import { ipcMain } from 'electron'
import { VectorStore } from "@langchain/core/vectorstores"
import LangchainService from "./LangchainService"
import OllamaService from "./OllamaService"
import { ParamsFromFString, PromptTemplate } from "@langchain/core/prompts"
import { StringOutputParser } from "@langchain/core/output_parsers"
import { Document } from "@langchain/core/documents";
import { ChatRequest, GenerateRequest } from 'ollama'
import { Ollama } from "@langchain/ollama";
import { IterableReadableStream } from '@langchain/core/dist/utils/stream'
import MCPService from './MCPService'
import MCPClient from './MCPClient'
import { raw } from 'express'

const combineDocuments = (docs: Document[]): string => {
  return docs.map((doc: Document) => `Content: ${doc.pageContent} (Source: ${doc.metadata}`).join('\n\n');  
}
export default class ContextChat {
  langchainService: LangchainService;
  ollamaService: OllamaService;
  prompt: string = '';
  context: string = ''
  ollamaLlm: Ollama | undefined;
  webContents: Electron.WebContents | undefined;
  mcpService: MCPService | undefined;
  mcpClient: MCPClient | undefined;

  constructor(langchainService: LangchainService, ollamaService: OllamaService) {
    this.langchainService = langchainService;    
    this.ollamaService = ollamaService;    
  }

  emit = (args: any) => {
    this.webContents?.send('chat', {
      response: args
    })                
  }

  register = (webContents: Electron.WebContents | undefined) => {
    this.webContents = webContents;
    ipcMain.on('chat', async (event: any, arg: any) => {
      const { callbackId, command, params }= arg;
      console.log('chat:', callbackId, command, params)
      let response: any = {}
      switch (command) {
        case "mcpServices": {
          response = await this.mcpServices(params); 
        }
        break;
        case "question": {
          response = await this.getAnswer(params); 
        }
        break;
      }
      event.reply('reply', {
        callbackId,
        response: JSON.stringify(response)
      })
    }) 
  }

  mcpServices = async (options: any) => {
    const { mcpServices } = options;

    if (mcpServices === true) {
      if (!this.mcpService) {
        this.mcpService = new MCPService();
        this.mcpService.init();
        this.mcpService.register();
        this.mcpService.start();

        this.mcpClient = new MCPClient();
        this.mcpClient.init();
        /*
        console.log('tools:', JSON.stringify(await this.mcpClient.listTools()));
        const result: any =  await this.mcpClient.callTool('sum', {
          "a": [ 5, 4, 7, 8, 9 ]
        })
        console.log('sum:result:', result);
        */
      }
    } else {
      if (this.mcpService) {
        this.mcpService.stop();
        this.mcpService = undefined;
      }
    }
  }

  getAnswer = async (options: any): Promise<string> => {
    if (!this.ollamaService.isReady || !this.ollamaService.ollama) {
      return 'Services not ready';
    }

    try {
      console.log('Ollama connection:ctx:', options.numCtx);
      this.ollamaLlm = new Ollama({
        baseUrl: "http://localhost:11434",
        model: options.model,
        numCtx: options.numCtx ? options.numCtx : undefined
      });

      let vectorStoreRetriever;
      if (options.mmr) {
        console.log('getMMRAnswer:', options.filter, options.k);
        vectorStoreRetriever = (await this.langchainService.getSearchableVectorStore(JSON.parse(options.chunkParams)))?.asRetriever({
          searchType: "mmr",
          searchKwargs: {
            fetchK: options.k,
          },
          filter: options.filter ? (doc: Document) => doc.pageContent.toLowerCase().indexOf(options.filter.toLowerCase()) > -1 : undefined,
          k: (options.k / 2)
        });
      } else {
        console.log('getSimilarityAnswer:', options.filter, options.k);
        vectorStoreRetriever = (await this.langchainService.getSearchableVectorStore(JSON.parse(options.chunkParams)))?.asRetriever({
          filter: options.filter ? (doc: Document) => doc.pageContent.toLowerCase().indexOf(options.filter.toLowerCase()) > -1 : undefined,
          k: options.k,
        });
      }

      if (vectorStoreRetriever) {

        let rawQuestion: string = options.question;        
        const toolParts: string[] = options.question.match(/#.*?#/g);
        console.log('found toolParts:', toolParts);

        try {
          for await (const tool of toolParts) {
            const replaceTool: string = tool;
            const rawTool: string = tool.replace(/^#/,'').replace(/#$/,'');
            const callParts: string[] = rawTool.split('=');
            const params: any = JSON.parse(callParts[1]);
            console.log('parts:', callParts[0], params);
            const results: any =  await this.mcpClient?.callTool(callParts[0], params)            
            const value: any = results.structuredContent.result;
            console.log('value:', value);
            rawQuestion = rawQuestion.replace(replaceTool, value);
          }
        } catch (te) {
          console.error(te);
          rawQuestion = options.question.replace(/#.*?#/g, '');
        }
      
        console.log('raw question:', rawQuestion);        
        const contextualizedQuestionPrompt: PromptTemplate<ParamsFromFString<any>, any> = PromptTemplate.fromTemplate(`
          {contextPrompt}
          chatHistory: {chatHistory}
          question: {userQuestion}  
        `);
        const contextQuestionChain = contextualizedQuestionPrompt
          .pipe(this.ollamaLlm)
          .pipe(new StringOutputParser())
          .pipe(vectorStoreRetriever);

        const documents = await contextQuestionChain.invoke({
          contextPrompt: options.contextPrompt,
          chatHistory: options.chatHistory,
          userQuestion: rawQuestion
        });
        const docs: Document[] = documents as Document[];
        const combinedDocs: string = combineDocuments(docs);
        console.log('askQuestion:combinedDocs:joining:', docs.length, '=>', combinedDocs.length);

        const questionTemplate = PromptTemplate.fromTemplate(`
            {prompt}
            <context>
            {context}
            </context>

            question: {userQuestion}
        `)

        const answerChain = questionTemplate
          .pipe(this.ollamaLlm)
          .pipe(new StringOutputParser());
        
        const llmResponse: IterableReadableStream<string> = await answerChain.stream({
          prompt: options.prompt,
          context: combinedDocs,
          userQuestion: rawQuestion
        });

        let finalAnswer: string = '';
        for await (const chunk of llmResponse) {
          finalAnswer += chunk;
          // console.log('chat-chunk', chunk);
          this.emit({ type: 'chat-chunk', chunk });
        }
        return finalAnswer;
      } else {
        console.error('empty vector store retriever!');
        return '';
      }
    } catch (e: any) {
      console.error(e);
      return e;
    }
    /*
    if (options.think) { 
      return this.ollamaService.chat(options as ChatRequest);  
    } else {
      return this.ollamaService.generate(options as GenerateRequest);  
    } 
    */   
  }
}

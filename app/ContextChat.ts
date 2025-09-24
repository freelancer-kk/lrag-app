import { ipcMain } from 'electron'
import { VectorStore } from "@langchain/core/vectorstores"
import LangchainService from "./LangchainService"
import { Client } from "@libsql/client/."
import OllamaService from "./OllamaService"
import { ParamsFromFString, PromptTemplate } from "@langchain/core/prompts"
import { StringOutputParser } from "@langchain/core/output_parsers"
import { Document } from "@langchain/core/documents";
import { ChatRequest, GenerateRequest } from 'ollama'
import { Ollama } from "@langchain/ollama";

const combineDocuments = (docs: Document[]): string => {
  return docs.map((doc: Document) => doc.pageContent).join('\n\n');
}
export default class ContextChat {
  ollamaService: OllamaService;
  vectorStore: VectorStore;
  libsqlClient: Client
  prompt: string = '';
  context: string = ''
  ollamaLlm: Ollama | undefined;
  webContents: Electron.WebContents | undefined

  constructor(langchainService: LangchainService, ollamaService: OllamaService) {
    this.vectorStore = langchainService.getVectorStore();
    this.libsqlClient = langchainService.getSqlClient();
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

  getAnswer = async (options: any): Promise<string> => {
    if (!this.vectorStore || !this.ollamaService.isReady || !this.ollamaService.ollama) {
      return 'Services not ready';
    }

    try {
      this.ollamaLlm = new Ollama({
        baseUrl: "http://localhost:11434",
        model: options.model
      });    
      
      const contextualizedQuestionPrompt: PromptTemplate<ParamsFromFString<any>, any> = PromptTemplate.fromTemplate(`
        {contextPrompt}
        chatHistory: {chatHistory}
        question: {userQuestion}  
      `);
      const contextQuestionChain = contextualizedQuestionPrompt
        .pipe(this.ollamaLlm)
        .pipe(new StringOutputParser())
        .pipe(this.vectorStore.asRetriever());

      const documents = await contextQuestionChain.invoke({
        contextPrompt: options.contextPrompt,
        chatHistory: options.chatHistory,
        userQuestion: options.question
      });
      const combinedDocs: string = combineDocuments(documents as Document[]);

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
      
      const llmResponse = await answerChain.stream({
        prompt: options.prompt,
        context: combinedDocs,
        userQuestion: options.question
      });

      let finalAnswer: string = '';
      for await (const chunk of llmResponse) {
        finalAnswer += chunk;
        // console.log('chat-chunk', chunk);
        this.emit({ type: 'chat-chunk', chunk });
      }
      return finalAnswer;
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

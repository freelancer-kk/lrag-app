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

const combineDocuments = (docs: Document[]): string => {
  return docs.map((doc: Document) => `Content: ${doc.pageContent} (Source: ${doc.metadata}`).join('\n\n');  
}
export default class ContextChat {
  langchainService: LangchainService;
  ollamaService: OllamaService;
  prompt: string = '';
  context: string = ''
  ollamaLlm: Ollama | undefined;
  ollamaRerankerLlm: Ollama;
  webContents: Electron.WebContents | undefined

  constructor(langchainService: LangchainService, ollamaService: OllamaService) {
    this.langchainService = langchainService;    
    this.ollamaService = ollamaService;

    this.ollamaRerankerLlm = new Ollama({
        baseUrl: "http://localhost:11434",
        model: "dengcao/Qwen3-Reranker-0.6B:Q8_0",
        temperature: 0.0        
    });
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

  applyFilter = (doc: Document, options: any): boolean => {
    return doc.pageContent.toLowerCase().indexOf(options.filter.toLowerCase()) > -1;
  }

  rerank_document = async (query: string, document: string): Promise<number> => {
    try {
      const rerankerPrompt: PromptTemplate<ParamsFromFString<any>, any> = PromptTemplate.fromTemplate(`      
          You are an expert relevance grader. Your task is to evaluate if the following document is relevant to the user's query.
          Please answer with a simple 'Yes' or 'No'.
    
          Query: {query}
          Document: {document}
      `);
      
      const rerankerChain = rerankerPrompt
            .pipe(this.ollamaRerankerLlm)
            .pipe(new StringOutputParser())

      const response: string = await rerankerChain.invoke({
        query,
        document
      })            
      console.log('reranker:', response);
      return 0.0;
    } catch (e) {
      console.error(e);
      return 0.0;
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
      let retrieverParams: any;
      if (options.mmr) {
        console.log('getMMRAnswer:', options.filter, options.k);
        retrieverParams = {
//          searchType: "mmr",          
          kOrFields: options.k,
          filter: options.filter ? (doc: Document) => this.applyFilter(doc, options) : undefined,
          k: (options.k / 2)
        };
      } else {
        console.log('getSimilarityAnswer:', options.filter, options.k);
        retrieverParams = {
          filter: options.filter ? (doc: Document) => this.applyFilter(doc, options) : undefined,
          k: options.k,
        };
      }

      vectorStoreRetriever = this.langchainService.getSearchableVectorStore()?.asRetriever(retrieverParams);
        

      if (vectorStoreRetriever && this.langchainService.hasAddedDocs) {
      
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
          userQuestion: options.question
        });
        const docs: Document[] = documents as Document[];

        /*
        for await (const doc of docs) {
          console.log('Reranking doc:', doc.metadata);
          const reranked_scores = await this.rerank_document(options.question, doc.pageContent);          
        }
        */

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
          userQuestion: options.question
        });

        let finalAnswer: string = '';
        for await (const chunk of llmResponse) {
          finalAnswer += chunk;
          // console.log('chat-chunk', chunk);
          this.emit({ type: 'chat-chunk', chunk });
        }
        return finalAnswer;
      } else {
        const questionTemplate = PromptTemplate.fromTemplate(`
            question: {userQuestion}
        `)

        const questionChain = questionTemplate
          .pipe(this.ollamaLlm)
          .pipe(new StringOutputParser())
        
        const llmResponse: IterableReadableStream<string> = await questionChain.stream({
//          prompt: options.historyPrompt,
//          chatHistory: options.chatHistory,
          userQuestion: options.question
        });

        let finalAnswer: string = '';
        for await (const chunk of llmResponse) {
          finalAnswer += chunk;
          // console.log('chat-chunk', chunk);
          this.emit({ type: 'chat-chunk', chunk });
        }
        return finalAnswer;
      }
    } catch (e: any) {
      console.error(e);
      return e;
    }  
  }
}

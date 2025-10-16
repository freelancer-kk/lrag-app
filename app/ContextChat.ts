import { ipcMain } from 'electron'
import LangchainService, { EVectorStoreType } from "./LangchainService"
import OllamaService from "./OllamaService"
import { ParamsFromFString, PromptTemplate } from "@langchain/core/prompts"
import { StringOutputParser } from "@langchain/core/output_parsers"
import { Document } from "@langchain/core/documents";
import { Ollama } from "@langchain/ollama";
import { IterableReadableStream } from '@langchain/core/dist/utils/stream'
import DockerEnv from './DockerEnv'

const combineDocuments = (docs: Document[]): string => {
  return docs.map((doc: Document) => `Content: ${doc.pageContent} (Source: ${doc.metadata}`).join('\n\n');  
}
export default class ContextChat {
  langchainService: LangchainService;
  ollamaService: OllamaService;
  rankingService: string | undefined;
  prompt: string = '';
  context: string = ''
  ollamaLlm: Ollama | undefined;
  webContents: Electron.WebContents | undefined

  constructor(langchainService: LangchainService, ollamaService: OllamaService, dockerEnv: DockerEnv) {
    this.langchainService = langchainService;    
    this.ollamaService = ollamaService;
    this.rankingService = dockerEnv.getKeyValue('RERANK_SERVICE');
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

  rerank_documents = async (query: string, docs: Document[]): Promise<Document[] | undefined> => {
    try {

      const body: any = {
        query,
        documents: docs.map((d: Document) => {
          return d.pageContent;
        }),
        metadata: docs.map((d: Document, index: number) => {
          return { "source" : index + '-' + d.metadata.source }
        }),
      }

      // console.log('body', body);

      const data: any = await (await fetch(
        this.rankingService + '/rerank',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body)
        }
      )).json();

      const ret_docs: Document[] = []
      for await (const md of data.metadata) {
        const fIdx: number = docs.findIndex((d, i) => (i + '-' + d.metadata.source) === md.source);
        // console.log('RERANKING:', docs[fIdx].pageContent.substring(0, 20));      
        
        ret_docs.push(docs[fIdx]);
      }
      return ret_docs;
    } catch (e) {
      console.error(e);    
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
          searchKwargs: {
            fetchK: options.k,
          },
          filter: options.filter ? (doc: Document) => this.applyFilter(doc, options) : undefined,
          k: (options.k / 2)
        };
        if (this.langchainService.vectorStoreType === EVectorStoreType.Memory) {
          console.log('USING MEMORY VECTOR!');
          retrieverParams.searchType = "mmr";
        }
      } else {
        console.log('getSimilarityAnswer:', options.filter, options.k);
        retrieverParams = {
          filter: options.filter ? (doc: Document) => this.applyFilter(doc, options) : undefined,
          k: options.k,
        };
      }

      vectorStoreRetriever = this.langchainService.getSearchableVectorStore()?.asRetriever(retrieverParams);
        
      if (vectorStoreRetriever && this.langchainService.hasAddedDocs) {
        console.log('INSIGHT: WITH DOC CONTEXT!')

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
        let docs: Document[] = documents as Document[];

        if (this.langchainService.vectorStoreType !== EVectorStoreType.Memory) {          
          this.emit({ type: 'reranking', data: { total: docs.length } });
          const reranked_docs: Document[] | undefined = await this.rerank_documents(options.question, docs);
          if (reranked_docs && reranked_docs.length > 0) {
            docs = reranked_docs;
          }
        }          
        
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
        console.log('INSIGHT: NO DOC CONTEXT!')

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

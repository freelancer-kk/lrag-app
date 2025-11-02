import { ipcMain } from 'electron'
import LangchainService, { EVectorStoreType } from "./LangchainService"
import OllamaService from "./OllamaService"
import { ParamsFromFString, PromptTemplate } from "@langchain/core/prompts"
import { StringOutputParser } from "@langchain/core/output_parsers"
import { Document } from "@langchain/core/documents";
import { Ollama } from "@langchain/ollama";
import { IterableReadableStream } from '@langchain/core/dist/utils/stream'
import DockerEnv from './DockerEnv'
import { AIMessageChunk } from '@langchain/core/messages'
import { concat } from "@langchain/core/utils/stream";
import ReRankerService from './RerankerService'

const combineDocuments = (docs: Document[]): string => {
  return docs.map((doc: Document) => `Content: ${doc.pageContent} (Source: ${doc.metadata}`).join('\n\n');  
}
export default class ContextChat {
  langchainService: LangchainService;
  ollamaService: OllamaService;
  rerankerService: ReRankerService;
  prompt: string = '';
  context: string = ''
  ollamaLlm: Ollama | undefined;
  webContents: Electron.WebContents | undefined

  constructor(langchainService: LangchainService, ollamaService: OllamaService, rerankerService: ReRankerService, dockerEnv: DockerEnv) {
    this.langchainService = langchainService;    
    this.ollamaService = ollamaService;
    this.rerankerService = rerankerService;
  }

  emit = (args: any) => {
    this.webContents?.send('chat', {
      response: JSON.stringify(args)
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

  getAnswer = async (options: any): Promise<string | undefined> => {
    if (!this.ollamaService.isReady() || !this.ollamaService.ollama || !this.rerankerService.isReady()) {
      return 'Services not ready ' + this.ollamaService.isReady() + ':' + (this.ollamaService.ollama !== undefined) + ':' + this.rerankerService.isReady();
    }

    try {
      console.log('Ollama connection:ctx:', options.numCtx);
      this.ollamaLlm = new Ollama({
        baseUrl: options.baseUrl,
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
          const reranked_docs: Document[] | undefined = await this.rerankerService.rerank(options.question, docs);
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
        
        const ref = this;
        const llmResponse: IterableReadableStream<string> = await answerChain.stream({
          prompt: options.prompt,
          context: combinedDocs,
          userQuestion: options.question
        }, {
          callbacks: [
            {
              handleLLMEnd(output) {
                // console.log('handleLLMEnd:', JSON.stringify(output, null, 2));
                ref.emit({ type: 'chat-chunk-metadata', data: output });
              },
            },
          ],
        });

        /*
        for await (const event of answerChain.streamEvents({
          prompt: options.prompt,
          context: combinedDocs,
          userQuestion: options.question
        }, {
          version: "v2"
        })) {
          console.log(event);
        }
          */

        let finalAnswer: AIMessageChunk | undefined;
        for await (const chunk of llmResponse) {
          if (finalAnswer) {
            finalAnswer = concat(finalAnswer, new AIMessageChunk(chunk));
          } else {
            finalAnswer = new AIMessageChunk(chunk);
          }
          // console.log('chat-chunk', chunk);
          this.emit({ type: 'chat-chunk', data: chunk });
        }
        console.log(finalAnswer?.usage_metadata)
        return finalAnswer?.content.toString();
      } else {
        console.log('INSIGHT: NO DOC CONTEXT!')

        const questionTemplate = PromptTemplate.fromTemplate(`
            question: {userQuestion}
        `)

        const questionChain = questionTemplate
          .pipe(this.ollamaLlm)
          .pipe(new StringOutputParser())
        
        const llmResponse: IterableReadableStream<string> = await questionChain.stream({
          userQuestion: options.question
        }, {
          metadata: {
            include_usage: true,
          }
        });

        let finalAnswer: AIMessageChunk | undefined;
        for await (const chunk of llmResponse) {
          if (finalAnswer) {
            finalAnswer = concat(finalAnswer, new AIMessageChunk(chunk));
          } else {
            finalAnswer = new AIMessageChunk(chunk);
          }
          // console.log('chat-chunk', chunk);
          this.emit({ type: 'chat-chunk', data: chunk });
        }
        console.log(finalAnswer?.usage_metadata)
        return finalAnswer?.content.toString();
      }
    } catch (e: any) {
      console.error(e);
      return e;
    }  
  }
}

import { ipcMain } from 'electron'
import LangchainService from "./LangchainService"
import OllamaService from "./OllamaService"
import { ChatPromptTemplate, ParamsFromFString, PromptTemplate } from "@langchain/core/prompts"
import { StringOutputParser } from "@langchain/core/output_parsers"
import { Document } from "@langchain/core/documents";
import { ChatOllama, OllamaInput } from "@langchain/ollama";
import { IterableReadableStream } from '@langchain/core/dist/utils/stream'
import DockerEnv from './DockerEnv'
import { AIMessageChunk } from '@langchain/core/messages'
import { concat } from "@langchain/core/utils/stream";
import ReRankerService from './RerankerService'
import log from 'electron-log/main';
import * as path from 'path';
import { readFileSync, writeFileSync } from 'fs'
import mime from 'mime'

const combineDocuments = (docs: Document[]): string => {
  return docs.map((doc: Document) => `Content: ${doc.pageContent} (Source: ${doc.metadata}`).join('\n\n');  
}
export default class ContextChat {
  langchainService: LangchainService;
  ollamaService: OllamaService;
  rerankerService: ReRankerService;
  prompt: string = '';
  context: string = ''
  ollamaLlm: ChatOllama | undefined;
  webContents: Electron.WebContents | undefined;

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
      log.info('chat:', callbackId, command, params)
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

  applyDocFilter = (doc: Document, options: any, nf: ((d: Document, o: any) => boolean) | undefined): boolean => {
    const sourceName: string = doc.metadata.source.replace(/\\/g, '/').replace(/\/\//g, '/');
    // log.info('applyDocFilter:', sourceName, 'included', options.fileNames.includes(sourceName));
    if (nf) {
      return options.fileNames.includes(sourceName) && nf(doc, options);
    } else {
      return options.fileNames.includes(sourceName);
    }
  }

  applyFilter = (doc: Document, options: any): boolean => {
    return doc.pageContent.toLowerCase().indexOf(options.filter.toLowerCase()) > -1;
  }

  getAnswer = async (options: any): Promise<any> => {
    if (!this.ollamaService.isReady() || !this.ollamaService.ollama || !this.rerankerService.isReady()) {
      return Promise.resolve({ error: 'Services not ready ' + this.ollamaService.isReady() + ':' + (this.ollamaService.ollama !== undefined) + ':' + this.rerankerService.isReady() });
    }
    
    try {
      await this.ollamaService.unloadLastUsedModel();      
      this.ollamaService.setLastUsedModel(options.model);
      
      const ollamaOptions: OllamaInput = {
        baseUrl: options.baseUrl,
        model: options.model,
        numCtx: options.numCtx ? options.numCtx : undefined,
        headers: this.ollamaService.headers        
      };      
      log.info('Ollama connection:options:', ollamaOptions);
      this.ollamaLlm = new ChatOllama(ollamaOptions);

      let isStandardChat: boolean = true;
      if (this.langchainService.hasAddedDocs && options.useDocContext) {
        let vectorStoreRetriever;
        let retrieverParams: any;
        if (options.mmr) {
          log.info('getMMRAnswer:', options.filter, options.k);
          retrieverParams = {
            searchKwargs: {
              fetchK: options.k,
            },
            filter: (doc: Document) => options.filter ? this.applyDocFilter(doc, options, this.applyFilter) : this.applyDocFilter(doc, options, undefined),
            k: (options.k / 2)
          };        
        } else {
          log.info('getSimilarityAnswer:', options.filter, options.k);
          retrieverParams = {
            filter: (doc: Document) => options.filter ? this.applyDocFilter(doc, options, this.applyFilter) : this.applyDocFilter(doc, options, undefined),
            k: options.k,
          };
        }
        const docSources: string[] = [];
        vectorStoreRetriever = this.langchainService.getSearchableVectorStore()?.asRetriever(retrieverParams);      

        if (vectorStoreRetriever) {
          isStandardChat = false;
          let combinedDocs: string = '';
          let images: any[] = [];
          
          if (options.fileNames && Array.isArray(options.fileNames) && options.fileNames.length > 0) {
            options.fileNames.forEach((fileName: string) => {
              const extension = path.extname(fileName).toLowerCase();
              if ((extension === '.png') || (extension === '.jpg') || (extension === '.jpeg') || (extension === '.tiff') || (extension === '.bmp')) {
                const imgPath = fileName;
                const url: string = `data:${mime.lookup(extension)};base64,${readFileSync(imgPath).toString("base64")}`
                // const url: string = readFileSync(imgPath).toString("base64");
                log.info('Embedding image in chat from:', imgPath, url.substring(0, 50) + '...');
                images.push({
                  type: "image_url",
                  image_url: { url }
                });                
              }
            });
          }

          if (images.length > 0 && images.length === options.fileNames.length) {
            log.info('INSIGHT: WITH DOC CONTEXT ONLY IMAGES!')
          } else {
            log.info('INSIGHT: WITH DOC & IMAGES CONTEXT!')
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
        
            const uniqueDocs = docs.filter((doc, index, self) =>
              index === self.findIndex((t) => (
                t.metadata.source === doc.metadata.source && t.pageContent === doc.pageContent
              ))
            );

            this.emit({ type: 'reranking', data: { total: docs.length } });
            const reranked_docs: Document[] | undefined = await this.rerankerService.rerank(options.question, uniqueDocs);
            if (reranked_docs && reranked_docs.length > 0) {
              docs = reranked_docs;
            }        

            for await (const doc of docs) {
              const name: string = path.basename(doc.metadata.source);
              if (!docSources.includes(name)) {
                docSources.push(name);
              }
            }
            
            combinedDocs = combineDocuments(docs);
            // writeFileSync('combinedDocs.txt', combinedDocs);
            log.info('askQuestion:combinedDocs:joining:', docs.length, '=>', combinedDocs.length);
          }

          const questionTemplate = ChatPromptTemplate.fromMessages([
            ["system", "{prompt}"],
            ["user", [
              { type: "text", text: "context: {context}" },
              { type: "text", text: "question: {userQuestion}" },
              ...images
            ]],
          ]);

          // log.info('questionTemplate:', questionTemplate);
          
          const stringChain = questionTemplate
            .pipe(this.ollamaLlm)
            .pipe(new StringOutputParser());

          const ref = this;
          const llmResponse: IterableReadableStream<string> = await stringChain.stream({
            prompt: options.prompt,
            context: combinedDocs,
            userQuestion: options.question
          }, {
            callbacks: [
              {
                handleLLMEnd(output) {
                  // log.info('handleLLMEnd:', JSON.stringify(output, null, 2));
                  ref.emit({ type: 'chat-chunk-metadata', data: output });
                },
              },
            ],
          });

          let finalAnswer: AIMessageChunk | undefined;
          for await (const chunk of llmResponse) {
            if (finalAnswer) {
              finalAnswer = concat(finalAnswer, new AIMessageChunk(chunk));
            } else {
              finalAnswer = new AIMessageChunk(chunk);
            }
            // log.info('chat-chunk', chunk);
            this.emit({ type: 'chat-chunk', data: chunk });
          }
          log.info(finalAnswer?.usage_metadata)
          return {
            answer: finalAnswer?.content.toString(),
            docSources
          }
        }
      } 
      
      if (isStandardChat) {
        log.info('INSIGHT: NO DOC CONTEXT!')

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
          // log.info('chat-chunk', chunk);
          this.emit({ type: 'chat-chunk', data: chunk });
        }
        log.info(finalAnswer?.usage_metadata)
        return {
          answer: finalAnswer?.content.toString(),
          docSources: []
        }
      }
    } catch (e: any) {
      log.error(e);
      return {
        error: e
      }
    }  
  }
}

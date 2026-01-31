import { ipcMain } from 'electron'
import LangchainService from "./LangchainService"
import OllamaService from "./OllamaService"
import { ChatPromptTemplate, ParamsFromFString, PromptTemplate } from "@langchain/core/prompts"
import { StringOutputParser } from "@langchain/core/output_parsers"
import { Document } from "@langchain/core/documents";
import { ChatOllama, ChatOllamaInput } from "@langchain/ollama";
import { IterableReadableStream } from '@langchain/core/dist/utils/stream'
import DockerEnv from './DockerEnv'
import ReRankerService from './RerankerService'
import log from 'electron-log/main';
import * as path from 'path';
import { readFileSync } from 'fs'
import mime from 'mime'
import { BaseCallbackHandler } from "@langchain/core/callbacks/base";
import { LLMResult } from '@langchain/core/outputs'
import { Ollama, WebFetchResponse, WebSearchResponse } from "ollama";
import { tool } from "@langchain/core/tools";
import { Runnable, RunnableConfig } from '@langchain/core/runnables'
import { Serialized } from '@langchain/core/dist/load/serializable'
import { Callbacks } from '@langchain/core/callbacks/manager'
import { Converter } from 'showdown';
import { isString } from 'mathjs'

const toolPrefixPrompt = "You are a helpful AI assistant with access to the web_search tool. When a tool is required then respond with <|tool_call|> followed by a JSON list of the tools. If a tool is not required then respond with a conversational answer to the user question."
  
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

  processToolResults = async (data: string, url: string): Promise<any> => {
    try {
      const body: any = {
        data,
      }
      
      const response: any = await (await fetch(
        url,
        {
          signal: AbortSignal.timeout(60000),
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body)
        }
      )).text();
      
      return response;
    } catch (e) {
      log.error(e);
      return e;
    }    
  }
  
  getAnswer = async (options: any): Promise<any> => {
    if (!this.ollamaService.isReady() || !this.ollamaService.ollama || !this.rerankerService.isReady()) {
      return Promise.resolve({ error: 'Services not ready ' + this.ollamaService.isReady() + ':' + (this.ollamaService.ollama !== undefined) + ':' + this.rerankerService.isReady() });
    }
    
    try {
      await this.ollamaService.unloadLastUsedModel();      
      this.ollamaService.setLastUsedModel(options.model);
      
      const useTools: boolean = this.ollamaService.ollama_api_key && options.capabilities && options.capabilities.includes('tools');
      // const useTools: boolean = false;

      const ollamaOptions: ChatOllamaInput = {
        baseUrl: options.baseUrl,
        model: options.model,
        numCtx: options.numCtx ? options.numCtx : undefined,
        headers: this.ollamaService.headers,
        metadata: { 
          includeUsage: true,          
        },
        streaming: options.streaming,
        temperature: useTools && !options.useDocContext ? 0 : options.temperature
      };      
      log.info('Ollama connection:options:', ollamaOptions);

      this.ollamaLlm = new ChatOllama(ollamaOptions);
      
      let isStandardChat: boolean = true;
      const ref = this;
      let toolResult: any = undefined;
      
      const webSearchTool = tool(
        async ({ query }: { query: string }) => {
          const ollamaClient = new Ollama({
            host: options.baseUrl,
            headers: this.ollamaService.headers 
          });
          // Native Ollama web search call
          log.info('webSearchTool:searching query:', query);
          const results = await ollamaClient.webSearch({ query });
          return JSON.stringify(results);
        },
        {
          name: "web_search",
          description: "Searches the web for live information on a given query.",
          // Bypassing Zod entirely avoids the "Type instantiation is excessively deep" error
          schema: {
            type: "object",
            properties: {
              query: {
                type: "string",
                description: "The search query to look up",
              },
            },
            required: ["query"],
          },
        }
      )

      const webFetchTool = tool(
        async ({ url }: { url: string }) => {
          const ollamaClient = new Ollama({
            host: options.baseUrl,
            headers: this.ollamaService.headers 
          });
          // Native Ollama web fetch call
          log.info('webFetchTool:fetching url:', url);
          const results = await ollamaClient.webFetch({ url });
          return JSON.stringify(results);
        },
        {
          name: "web_fetch",
          description: "Fetches the content of a given URL.",
          // Bypassing Zod entirely avoids the "Type instantiation is excessively deep" error
          schema: {
            type: "object",
            properties: {
              url: {
                type: "string",
                description: "The URL to fetch content from",
              },
            },
            required: ["url"],
          },
        }
      )      
      class TokenUsageHandler extends BaseCallbackHandler {
        name = "TokenUsageHandler";

        handleLLMEnd(output: LLMResult, runId: string, parentRunId?: string, tags?: string[], extraParams?: Record<string, unknown>) {
          log.info('handleLLMEnd:', JSON.stringify(output.llmOutput, null, 2));
          ref.emit({ type: 'chat-chunk-metadata', data: output });
        }
      }

      const customCallbacks: Callbacks = [
        new TokenUsageHandler(),
        {
          name: "web_search_tool_handler",
          handleToolStart(tool: Serialized, input: string, runId: string) {
            log.info(`[Tool Call Started]: ${tool.name} with input ${JSON.stringify(input)}`);            
          },
          handleToolEnd(output: any, runId: string) {
            log.info(`[Tool Call Ended]: ${tool.name} with output ${output}`);            
          } 
        }
      ];

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
            [
              "system",
              "{prompt}"
            ],
            [
              "user", [
                { type: "text", text: "context: {context}" },
                { type: "text", text: "question: {userQuestion}" },
                ...images
              ]
            ],
          ]);
          // log.info('questionTemplate:', questionTemplate);

          let stringChain: Runnable<any, string, RunnableConfig<Record<string, any>>> | any;
          if (useTools) {          
            log.info('Using tools in context chat');
            stringChain = questionTemplate
              .pipe(this.ollamaLlm.bindTools([webSearchTool]))      
//            .pipe(new StringOutputParser())                      
          } else {
            stringChain = questionTemplate
              .pipe(this.ollamaLlm)
              .pipe(new StringOutputParser());
          }

          const replaceVars: any = {
            prompt: useTools ? (toolPrefixPrompt + " " + options.prompt) : options.prompt,
            context: combinedDocs,
            userQuestion: options.question
          }
        
          log.info('docAnswerTemplate:', replaceVars);
          const llmResponse: IterableReadableStream<string | any> = await stringChain.stream(
            replaceVars, 
            {
              callbacks: customCallbacks,
            }
          );

          let finalAnswer;
          for await (const chunk of llmResponse) {
            finalAnswer = finalAnswer ? finalAnswer.concat(chunk) : chunk;
            
            this.emit({ type: 'chat-chunk', data: useTools && chunk.content ? chunk.content : (isString(chunk) ? chunk : '') });
          }

          log.info('TOOL CALLS:', finalAnswer.tool_calls);
          if (useTools && finalAnswer?.tool_calls?.length > 0) {
            for (const toolCall of finalAnswer.tool_calls) {
              const toolName: string = toolCall.name;
              log.info(`\n[Calling Tool]: ${toolName}...`);
              let toolResults: any;
              if (toolName === 'web_search') {
                toolResults = await (webSearchTool as any).invoke(toolCall.args);
              }
              if (toolName === 'web_fetch') {
                toolResults = await (webFetchTool as any).invoke(toolCall.args);
              }
              const parsedResults: any = JSON.parse(toolResults);
              log.info("[Tool Results]:", parsedResults.results);
              // Append tool result to final answer
              const converter = new Converter();
              for (const entry of parsedResults.results) {
                finalAnswer.content += `${converter.makeHtml(entry.content)}\n\n  (Source: ${entry.url})\n\n`; 
              }
            }
          }  

          if (options.toolPrompt && options.toolPrompt.trim().length > 0) {
            log.info('Processing tool prompt...', options.toolPrompt);
            toolResult = await this.processToolResults(finalAnswer || '', options.toolPrompt);
          }          
          
          return {
            answer: useTools && finalAnswer.content ? finalAnswer.content : (isString(finalAnswer) ? finalAnswer : ''),
            docSources,
            toolResult
          }
        }
      } 
      
      if (isStandardChat) {
        if (useTools) {
          options.chatPrompt = `{system}\n\n{prompt}`;
        }
        
        const questionTemplate = PromptTemplate.fromTemplate(options.chatPrompt)

        let questionChain: any;
        if (useTools) {          
          log.info('Using tools in context chat');
          questionChain = questionTemplate
            .pipe(this.ollamaLlm.bindTools([webSearchTool, webFetchTool]));
//            .pipe(new StringOutputParser())
        } else {
          questionChain = questionTemplate
            .pipe(this.ollamaLlm)
            .pipe(new StringOutputParser())
        }        
                
        let replaceVars: any = {
          system: useTools ? toolPrefixPrompt : "You are a helpful assistant.",
          prompt: options.question
        }
        if (!options.chatPrompt.endsWith('{prompt}')) {
          replaceVars = {
            question: options.question
          }
        }

        log.info('INSIGHT: NO DOC CONTEXT!', options.chatPrompt, replaceVars)
        const llmResponse: any = await questionChain.stream(
          replaceVars, 
          {
            callbacks: customCallbacks,
          }
        );

        let finalAnswer: any;
        for await (const chunk of llmResponse) {
          finalAnswer = finalAnswer ? finalAnswer.concat(chunk) : chunk;
          // log.info('chat-chunk', chunk);
          this.emit({ type: 'chat-chunk', data: useTools && chunk.content ? chunk.content : (isString(chunk) ? chunk : '') });
        }
        
        log.info('TOOL CALLS:', finalAnswer.tool_calls);
        if (useTools && finalAnswer?.tool_calls?.length > 0) {
          for (const toolCall of finalAnswer.tool_calls) {
            const toolName: string = toolCall.name;
            log.info(`\n[Calling Tool]: ${toolName}...`);
            let toolResults: any;
            if (toolName === 'web_search') {
              toolResults = await (webSearchTool as any).invoke(toolCall.args);
            }
            if (toolName === 'web_fetch') {
              toolResults = await (webFetchTool as any).invoke(toolCall.args);
            }
            const parsedResults: any = JSON.parse(toolResults);
            log.info("[Tool Results]:", parsedResults.results);
            // Append tool result to final answer
            const converter = new Converter();
            for (const entry of parsedResults.results) {
              finalAnswer.content += `${converter.makeHtml(entry.content)}\n\n  (Source: ${entry.url})\n\n`; 
            }
          }
        }        
        
        if (options.toolPrompt && options.toolPrompt.trim().length > 0) {
          log.info('Processing tool prompt...', options.toolPrompt);
          toolResult = await this.processToolResults(finalAnswer || '', options.toolPrompt);
        }
          
        return {
          answer: useTools && finalAnswer.content ? finalAnswer.content : (isString(finalAnswer) ? finalAnswer : ''),
          docSources: [],
          toolResult
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

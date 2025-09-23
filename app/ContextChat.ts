import { ipcMain } from 'electron';
import { VectorStore } from "@langchain/core/vectorstores";
import LangchainService from "./LangchainService";
import { Client } from "@libsql/client/.";
import OllamaService from "./OllamaService";

export default class ContextChat {
  ollamaService: OllamaService;
  vectorStore: VectorStore;
  libsqlClient: Client
  prompt: string = '';
  context: string = ''

  constructor(langchainService: LangchainService, ollamaService: OllamaService) {
    this.vectorStore = langchainService.getVectorStore();
    this.libsqlClient = langchainService.getSqlClient();
    this.ollamaService = ollamaService;
  }

  register = () => {
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
    if (!this.vectorStore || !this.ollamaService.isReady) {
      return 'Services not ready';
    }    

    if (options.think) { 
      return this.ollamaService.chat(options);  
    } else {
      return this.ollamaService.generate(options);  
    }
  }
}

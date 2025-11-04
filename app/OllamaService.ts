import { ipcMain } from 'electron';
import * as path from 'path';

import { Ollama, AbortableAsyncIterator, DeleteRequest, GenerateRequest, GenerateResponse, ListResponse, ProgressResponse, PullRequest, ShowRequest, ShowResponse, StatusResponse, ChatResponse, ChatRequest } from "ollama";
import { isMac, isWindows } from './SystemInfo';
import DepService from './DepService';

export default class OllamaService {
  serviceInstance: DepService;
  serviceInstanceNoGPU: DepService | undefined;
  ollama: Ollama | undefined;
  webContents: Electron.WebContents | undefined;
  gpuAcceleration = true;
  isIPEX: boolean = false;
  
  constructor(
    installedVersion: string,
    availableVersion: string,
    installedIPEXVersion: string,
    availableIPEXVersion: string,
    darwin_dl: string,
    ipex_dl: string,
    rocm_dl: string,
    default_dl: string,
    userTempPath: string,
    appDataPath: string,
    gpuBrands: string[],
    gpuAcceleration: boolean,
    versionCB: () => void,
  ) {
    this.gpuAcceleration = gpuAcceleration;
    let execDir: string = path.join(appDataPath, 'ollama');
    let ollamaExecutable: string = "ollama.exe";
    let ollamaArgs: string[] = ['serve'];
    let urls: string[] = [];

    if (isWindows) {
      if (gpuBrands.find(f => f.toLowerCase().startsWith('nvidia'))) {
        console.log('ollama choice: nvidia: win');
        urls = [default_dl];        
      } else if (gpuBrands.find(f => f.toLowerCase().startsWith('amd')) || gpuBrands.find(f => f.toLowerCase().startsWith('advanced'))) {
        console.log('ollama choice: amd: win');
        urls = [default_dl, rocm_dl];        
      } else if (gpuBrands.find(f => f.toLowerCase().startsWith('intel'))) {
        console.log('ollama choice: ipex: win');
        urls = [ipex_dl];
        ollamaArgs = [];
        ollamaExecutable = 'ollama-serve.bat';
        this.isIPEX = true;
      } else {
        console.log('ollama choice: nogpu: win');
        urls = [default_dl];
      }
    } else if (isMac) {
      console.log('ollama choice: darwin');
      urls = [darwin_dl];      
      ollamaExecutable = 'ollama.app';      
    }
    
    this.serviceInstance = new DepService(
      "ollama",
      "ollama",
      ollamaExecutable,      
      execDir,
      ollamaArgs,
      appDataPath,
      userTempPath,
      urls,
      async (): Promise<boolean> => {
        this.ollama = new Ollama({ host: 'http://127.0.0.1:11434' });
        try {
          const response: ListResponse  = await this.ollama.ps();
          // console.log('ollamaService:readyCheck:', response);
          return Array.isArray(response.models);
        } catch (e) {
          console.error('ollamaService:not:ready', e);
        }
        return false
      },
      [],
      this.isIPEX ? installedIPEXVersion : installedVersion,
      this.isIPEX ? availableIPEXVersion: availableVersion,
      versionCB,
      () => {},
      process.env
    )

    if (this.isIPEX) {
      // Not relevant for MAC only WIN IPEX
      this.serviceInstanceNoGPU = new DepService(
        "ollamaNoGPU",
        "ollama",
        "ollama.exe",      
        execDir,
        ["serve"],
        appDataPath,
        userTempPath,
        [default_dl],
        async (): Promise<boolean> => {
          this.ollama = new Ollama({ host: 'http://127.0.0.1:11434' });
          try {
            const response: ListResponse  = await this.ollama.ps();
            // console.log('ollamaService:readyCheck:', response)
            return Array.isArray(response);
          } catch (e) {
            console.error('ollamaService:readyCheck:error:', e);
          }
          return false
        },
        [],
        installedVersion,
        availableVersion,
        versionCB,
        () => {},
        process.env
      )
    }
  }

  register = (webContents: Electron.WebContents | undefined) => {
    this.webContents = webContents;
    this.serviceInstance.register(this.webContents);
    if (this.serviceInstanceNoGPU) {
      this.serviceInstanceNoGPU.register(this.webContents);
    }
    ipcMain.on('service-ollama', async (event: any, arg: any) => {
      const { callbackId, command, params }= arg;
      console.log('ollama:', callbackId, command, params)
      let response: any = {}
      try {
        switch (command) {
          case "generate": {
            response = await this.generate(params as GenerateRequest);
          }
          break;
          case "chat": {
            response = await this.chat(params as ChatRequest);
          }
          break;
          case "pull": {
            response = await this.pull(params as PullRequest);          
          }
          break;
          case "rm": {
            response = await this.rm(params as DeleteRequest);          
          }
          break;
          case "list": {
            response = await this.list();
          }
          break;
          case "show": {
            response = await this.show(params as ShowRequest);
          }
          break;
          case "ps": {
            response = await this.ps();
          }
          break;        
          case "abort": {
            this.abort();
          }
          break;        
          case "gpuAccel": {
            const { gpuAcceleration } = params;
            this.emit({ type: 'ollama-gpu-accel-started', data: { status: 'ok' } })
            this.gpuAcceleration = gpuAcceleration;
            await this.stop();
            if (gpuAcceleration) {
              await this.serviceInstance.install();              
            } else {              
              await this.serviceInstanceNoGPU?.install();              
            }
            await this.startIfInstalled();
            this.emit( { type: 'ollama-gpu-accel-done', data: { status: 'ok' } })  
            response = { status: 'ok', data: 'gpu-accel-change' };
          }
          break;        
          default: {
            if (this.gpuAcceleration) {
              response = await this.serviceInstance.handleCommand(event, arg);
            } else {
              response = await this.serviceInstanceNoGPU?.handleCommand(event, arg);
            }
          } 
        }
      } catch (e) {
        console.error(e);
        response.error = e;
      }
      response.command = command;
      response.params = params;
      event.reply('reply', {
        callbackId,
        response: JSON.stringify(response)
      })
    }) 
  }

  install = (): Promise<boolean> | undefined => {
    return this.gpuAcceleration ? this.serviceInstance.install() : this.serviceInstanceNoGPU?.install();
  }

  startIfInstalled = () => {
    this.gpuAcceleration ? this.serviceInstance.startIfInstalled() : this.serviceInstanceNoGPU?.startIfInstalled()
  }

  stop = (): Promise<any> | undefined => {
    return this.gpuAcceleration ? this.serviceInstance.stop() : this.serviceInstanceNoGPU?.stop()
  }

  isReady = (): boolean | undefined => {
    return this.gpuAcceleration ? this.serviceInstance.isReady : this.serviceInstanceNoGPU?.isReady
  }

  emit = (args: any) => {
    // const ev: any = JSON.parse(args);
    // console.log('event:', ev);
    this.webContents?.send('event', {
      response: args
    })                
  }
  
  generate = async (request: any): Promise<string> => {
    if (this.ollama) {
      this.emit( { type: 'ollama-generate-start', data: { prompt: request.prompt } })
      try {
        const result: AbortableAsyncIterator<GenerateResponse> = await this.ollama.generate(request);
        let response = '';
        for await (const part of result) {
          console.log(part.response);
          response += part.response;
        }
        this.emit( { type: 'ollama-generate-complete', data: { prompt: request.prompt, response } })
        return response;
      } catch (e) {
        this.emit( { type: 'ollama-generate-error', error: e })
        return '';
      }

    }
    return Promise.reject('no service');
  }

  chat = async (request: any): Promise<string> => {
    if (this.ollama) {
      try {
        this.emit( { type: 'ollama-thinking-start', data: { prompt: request.prompt } })
        const response: AbortableAsyncIterator<ChatResponse> = await this.ollama.chat(request);
        let startedThinking = false;
        let finishedThinking = false;

        let answer = '';
        for await (const chunk of response) {
          if (chunk.message.thinking && !startedThinking) {
            startedThinking = true
            process.stdout.write('Thinking:\n========\n\n')          
          } else if (chunk.message.content && startedThinking && !finishedThinking) {
            finishedThinking = true
            process.stdout.write('\n\nResponse:\n========\n\n')
            this.emit( { type: 'ollama-thinking-answer', data: { chunk: chunk.message.content } })          
            answer += chunk.message.content;
          }
          if (chunk.message.thinking) {
            process.stdout.write(chunk.message.thinking)
          } else if (chunk.message.content) {
            process.stdout.write(chunk.message.content)
            this.emit( { type: 'ollama-thinking-content', data: { chunk: chunk.message.content } })
          }
        }      
        return answer;
      } catch (e) {
        this.emit( { type: 'ollama-thinking-error', error: e })
        return '';
      }
    } else {
      return Promise.reject('no service');
    }
  }

  pull = async (request: any): Promise<any> => {
    if (this.ollama) {
      const stream: AbortableAsyncIterator<ProgressResponse> = await this.ollama.pull(request);
      let currentDigestDone: boolean = false;
      console.log('pulling started model:', request.model);
      this.emit( { type: 'ollama-pull-start', data: { model: request.model, percent: 0 } })
      for await (const part of stream) {
        if (part.digest) {
          let percent = 0
          if (part.completed && part.total) {
            percent = Math.round((part.completed / part.total) * 100)
          }
          // console.log(`${part.status} ${percent}%...`)
          this.emit( { type: 'ollama-pull-progress', data: { model: request.model, percent } })
          if (percent === 100 && !currentDigestDone) {
            this.emit( { type: 'ollama-pull-complete', data: { model: request.model, percent } })
          } else {
            currentDigestDone = false
          }
        } else {
          console.log(part.status)
          this.emit( { type: 'ollama-pull-part', data: { model: request.model, partStatus: part.status } })
        }        
      }
      console.log('pulling done model:', request.model);
      this.emit( { type: 'ollama-pull-done', data: { model: request.model } })
      return {
        model: request.model,
        status: 'ollama-pull-done',
      }      
    } else  {
      Promise.reject('no service')
    }           
  }

  rm = (request: DeleteRequest): Promise<StatusResponse> => {
    return this.ollama ? this.ollama.delete(request) : Promise.reject('no service');
  }

  list = (): Promise<ListResponse> => {
    return this.ollama ? this.ollama.list() : Promise.reject('no service');
  }

  show = (request: ShowRequest): Promise<ShowResponse> => {
    return this.ollama ? this.ollama.show(request) : Promise.reject('no service');
  }

  ps = (): Promise<ListResponse> => {
    return this.ollama ? this.ollama.ps() : Promise.reject('no service');
  }

  abort = (): void => {
    if (this.ollama) {
      this.ollama.abort();
    }    
  }  
}
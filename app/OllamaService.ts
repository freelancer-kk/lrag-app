import { ipcMain } from 'electron';
import * as path from 'path';

import { Ollama, AbortableAsyncIterator, DeleteRequest, GenerateRequest, GenerateResponse, ListResponse, ProgressResponse, PullRequest, ShowRequest, ShowResponse, StatusResponse, ChatResponse, ChatRequest } from "ollama";
import { isMac, isWindows } from './SystemInfo';
import DepService from './DepService';
import log from 'electron-log/main';

export default class OllamaService {
  serviceInstance: DepService;
  serviceInstanceNoGPU: DepService | undefined;
  ollama_api_key: string | undefined;
  ollama: Ollama | undefined;
  webContents: Electron.WebContents | undefined;
  gpuAcceleration = true;
  isIPEX: boolean = false;
  headers: any;
  
  constructor(
    ollama_api_key: string | undefined,
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
    this.ollama_api_key = ollama_api_key;
    if (ollama_api_key) {
      this.headers = {
        Authorization: 'Bearer ' + this.ollama_api_key
      }
    }
    this.gpuAcceleration = gpuAcceleration;
    let execDir: string = path.join(appDataPath, 'ollama');
    let ollamaExecutable: string = "ollama.exe";
    let ollamaArgs: string[] = ['serve'];
    let urls: string[] = [];

    if (isWindows) {
      if (gpuBrands.find(f => f.toLowerCase().startsWith('nvidia'))) {
        log.info('ollama choice: nvidia: win');
        urls = [default_dl];
      } else if (gpuBrands.find(f => f.toLowerCase().startsWith('amd')) || gpuBrands.find(f => f.toLowerCase().startsWith('advanced'))) {
        log.info('ollama choice: amd: win');
        urls = [default_dl, rocm_dl];        
      } else if (gpuBrands.find(f => f.toLowerCase().startsWith('intel'))) {
        log.info('ollama choice: ipex: win');
        urls = [default_dl];
        // urls = [ipex_dl];
        // ollamaArgs = [];
        // ollamaExecutable = 'ollama-serve.bat';
        this.isIPEX = false;
      } else {
        log.info('ollama choice: nogpu: win');
        urls = [default_dl];
      }
    } else if (isMac) {
      log.info('ollama choice: darwin');
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
        this.ollama = new Ollama({
          host: 'http://127.0.0.1:11434',
          headers: this.headers,
        });
        try {
          const response: ListResponse  = await this.ollama.ps();
          // log.info('ollamaService:readyCheck:', response);
          return Array.isArray(response.models);
        } catch (e) {
          log.error('ollamaService:not:ready', e);
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
      // Not relevant for MAC only WIN IPEX INTEL
      this.serviceInstanceNoGPU = new DepService(
        "ollamaNoGPU",
        "ollama",
        "ollama.exe",      
        path.join(appDataPath, 'ollamaNoGPU'),
        ["serve"],
        appDataPath,
        userTempPath,
        [default_dl],
        async (): Promise<boolean> => {
          this.ollama = new Ollama({
            host: 'http://127.0.0.1:11434',
            headers: this.headers,
          });
          try {
            const response: ListResponse  = await this.ollama.ps();
            // log.info('ollamaService:NoGPU:readyCheck:', response)
            return Array.isArray(response.models);
          } catch (e) {
            log.error('ollamaService:NoGPU:readyCheck:error:', e);
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

  handleCommand = async (event: any, arg: any) => {
    const { callbackId, command, params }= arg;
    log.info('ollama:', callbackId, command, params)
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
      log.error(e);
      response.error = e;
    }
    response.command = command;
    response.params = params;
    event.reply('reply', {
      callbackId,
      response: JSON.stringify(response)
    })
  }

  register = (webContents: Electron.WebContents | undefined) => {
    this.webContents = webContents;
    this.serviceInstance.register(this.webContents);
    if (this.serviceInstanceNoGPU) {
      this.serviceInstanceNoGPU.register(this.webContents);
    }
    ipcMain.on('service-ollama', async (event: any, arg: any) => {
      this.handleCommand(event, arg);
    });
    ipcMain.on('service-ollamaNoGPU', async (event: any, arg: any) => {
      this.handleCommand(event, arg);
    });
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
    // log.info('event:', ev);
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
          log.info(part.response);
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
      log.info('pulling started model:', request.model);
      this.emit( { type: 'ollama-pull-start', data: { model: request.model, percent: 0 } })
      for await (const part of stream) {
        if (part.digest) {
          let percent = 0
          if (part.completed && part.total) {
            percent = Math.round((part.completed / part.total) * 100)
          }
          // log.info(`${part.status} ${percent}%...`)
          this.emit( { type: 'ollama-pull-progress', data: { model: request.model, percent } })
          if (percent === 100 && !currentDigestDone) {
            this.emit( { type: 'ollama-pull-complete', data: { model: request.model, percent } })
          } else {
            currentDigestDone = false
          }
        } else {
          log.info(part.status)
          this.emit( { type: 'ollama-pull-part', data: { model: request.model, partStatus: part.status } })
        }        
      }
      log.info('pulling done model:', request.model);
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
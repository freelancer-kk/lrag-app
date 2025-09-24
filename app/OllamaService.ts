import { ipcMain } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import unzipper from 'unzipper';
import { ChildProcessWithoutNullStreams, spawn } from 'child_process';
import { Ollama, AbortableAsyncIterator, DeleteRequest, GenerateRequest, GenerateResponse, ListResponse, ProgressResponse, PullRequest, ShowRequest, ShowResponse, StatusResponse, ChatResponse, ChatRequest } from "ollama";

export default class OllamaService {
  archivePath: string = '';
  unzipPath: string;
  ollamaProcess: ChildProcessWithoutNullStreams | undefined;
  ollama: Ollama | undefined;
  webContents: Electron.WebContents | undefined;
  isReady: boolean = false;

  constructor(assetsFolderPath: string, appDataPath: string ) {
    this.unzipPath = path.join(appDataPath, 'ollama');
    if (process.platform === 'win32') {
      this.archivePath = path.join(assetsFolderPath, 'ollama-win.zip');
    } else if (process.platform === 'darwin') {
      this.archivePath = path.join(assetsFolderPath, 'ollama-darwin.zip');
    }    
  }

  register = (webContents: Electron.WebContents | undefined) => {
    this.webContents = webContents;
    ipcMain.on('ollama', async (event: any, arg: any) => {
      const { callbackId, command, params }= arg;
      console.log('ollama:', callbackId, command, params)
      let response: any = {}
      switch (command) {
        case "isRunning": {
          try {
            this.ollama = new Ollama({ host: 'http://127.0.0.1:11434' });
            response = await this.ollama.ps();
            this.isReady = true;            
          } catch (e) {
            this.isReady = false;
            this.ollama = undefined;            
          }
          response = { isReady: this.isReady };
        }
        break;
        case "isReady": {
          response = { isReady: this.isReady };
        }
        break;
        case "start": {
          response = this.start();
        }
        break;
        case "stop": {
          response = this.stop();
        }
        break;        
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
        default: {
          response = { error: 'unknown command' };
        } 
      }
      response.command = command;
      response.params = params;
      event.reply('reply', {
        callbackId,
        response: JSON.stringify(response)
      })
    }) 
  }

  emit = (args: any) => {
    // const ev: any = JSON.parse(args);
    // console.log('event:', ev);
    this.webContents?.send('event', {
      response: args
    })                
  }

  extract = () => {
    if (!fs.existsSync(this.unzipPath)) {
      console.log("Extracting ollama files...", this.unzipPath);
      fs.mkdirSync(this.unzipPath, { recursive: true });
      fs.createReadStream(this.archivePath)
        .pipe(unzipper.Extract({ path: this.unzipPath }))
        .on("close", () => {
          console.log("Files unzipped successfully");
          this.emit({ type: 'ollama-extract-done', data: this.unzipPath });
        });      
    }    
  }

  start = (): any => {
    try {
      this.ollamaProcess = spawn('ollama-serve.bat', {
        shell: true,
        cwd: this.unzipPath,
        stdio: ['pipe', 'pipe', 'pipe']
      });
      if (this.ollamaProcess) {
        this.ollamaProcess.stdout.on('data', (data: string) => {
            console.log(`stdout: ${data}`);
            // Send event
            this.emit({ type: 'ollama-stdout', data: Buffer.from(data).toString() });
        })
        this.ollamaProcess.stderr.on("data", (data: string) => {
            console.error(`stderr: ${data}`);
            // Send event
            this.emit({ type: 'ollama-stderr', data: Buffer.from(data).toString() });
        });
        this.ollamaProcess.on('exit', (code: number | null) => {
            console.log(`Ollama process ended with ${code}`);
            // Send event
            this.emit({ type: 'ollama-ended', data: code ? code.toString() : '0' });
        });
        setTimeout(() => {
          this.ollama = new Ollama({ host: 'http://127.0.0.1:11434' });
          // event Ollama connection is ready
          this.isReady = true;
          this.emit({ type: 'ollama-ready', data: 'ok' });
        }, 5000)
      } else {
        console.error('No valid process for Ollama!');
      }
      return { status: 'starting' };
    } catch (e) {
      console.error('Ollama start error:', e);
      return { status: 'error', error: e };
    } 
  }

  stop = (): any => {
    if (this.ollamaProcess) {
      this.ollamaProcess.kill();      
    } else {
      console.error('No valid process for Ollama!');
    }
    return { status: 'stopping' };
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
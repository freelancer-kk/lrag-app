import { ipcMain } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import unzipper from 'unzipper';
import { ChildProcessWithoutNullStreams, spawn } from 'child_process';
import { AbortableAsyncIterator, DeleteRequest, GenerateRequest, GenerateResponse, ListResponse, Ollama, ProgressResponse, PullRequest, ShowRequest, ShowResponse, StatusResponse } from 'ollama';
import EventEmitter from 'events';

export const emitter: EventEmitter = new EventEmitter();

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

    emitter.on('event', (args: any) => {
      try {
        const ev: any = JSON.parse(args);
        console.log('event:', ev);
        this.webContents?.send('event', {
          response: args
        })                
      } catch (e) {
        console.error(e);
      }
    })     
  }

  register = (webContents: Electron.WebContents | undefined) => {
    this.webContents = webContents;
    ipcMain.on('ollama', async (event: any, arg: any) => {
      const { callbackId, command, params }= arg;
      console.log('ollama:', callbackId, command, params)
      let response: any = {}
      switch (command) {
        case "hasStarted": {
          response = this.ollamaProcess ? true : false;
        }
        break;
        case "isReady": {
          response = this.isReady;
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
          response = this.abort();
        }
        break;        
        default: {
          response = { error: 'unknown command' };
        } 
      }
      event.reply('reply', {
        callbackId,
        response: JSON.stringify(response)
      })
    }) 
  }

  emit = (args: any) => {
    emitter.emit('event', JSON.stringify(args));
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

  start = () => {
    this.ollamaProcess = spawn(path.join(this.unzipPath, 'ollama-serve.bat'));
    if (this.ollamaProcess) {
      this.ollamaProcess.stdout.on('data', (data: any) => {
          console.log(`stdout:\n${data}`);
          // Send event
          this.emit({ type: 'ollama-stdout', data: data.toString() });
      })
      this.ollamaProcess.stderr.on("data", (data: any) => {
          console.error(`stderr: ${data}`);
          // Send event
          this.emit({ type: 'ollama-stderr', data: data.toString() });
      });
      this.ollamaProcess.on('exit', (code: number | null) => {
          console.log(`Ollama process ended with ${code}`);
          // Send event
          emitter.emit('event', { type: 'ollama-ended', data: code?.toString() });
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
  }

  stop = () => {
    if (this.ollamaProcess) {
      this.ollamaProcess.kill();
    } else {
      console.error('No valid process for Ollama!');
    }
  }

  generate = (request: any): Promise<AbortableAsyncIterator<GenerateResponse>> => {
    return this.ollama ? this.ollama.generate(request) : Promise.reject('no service');
  }

  pull = (request: any): Promise<AbortableAsyncIterator<ProgressResponse>> => {
    return this.ollama ? this.ollama.pull(request) : Promise.reject('no service');
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
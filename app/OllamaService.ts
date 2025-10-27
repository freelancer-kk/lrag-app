import { ipcMain } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import unzipper from 'unzipper';
import kill from 'tree-kill';
import find, { ProcessInfo } from "find-process";

import { Ollama, AbortableAsyncIterator, DeleteRequest, GenerateRequest, GenerateResponse, ListResponse, ProgressResponse, PullRequest, ShowRequest, ShowResponse, StatusResponse, ChatResponse, ChatRequest } from "ollama";
import { isMac, isWindows } from './SystemInfo';
import { ChildProcess, ChildProcessByStdio, ExecFileException, spawn } from 'child_process';
import Stream from 'stream';

export default class OllamaService {
  userTempPath: string;
  archivePaths: string[] = [];
  archiveNoGPUPath: string = '';
  unzipPath: string;
  ollamaProcess: ChildProcessByStdio<null, Stream.Readable, Stream.Readable> | undefined;
  ollama: Ollama | undefined;
  webContents: Electron.WebContents | undefined;
  isReady: boolean = false;
  ollamaExecutable: string = '';
  ollamaArgs: string[] = [];
  ollamaNoGPUArgs: string[] = [];
  isExtracting: boolean = false;
  ollamaPID: number = -1;
  gpuBrands: string[] = [];
  managedExternally = true;
  extractCnt: number = 0;

  darwin_download_link: string;
  ipex_download_link: string;
  rocm_download_link: string;
  default_download_link: string;
  ollama_upgraded: boolean;
  ipex_upgraded: boolean;
  isIPEX: boolean = false;
  
  constructor(ollama_upgraded: boolean, ipex_upgraded: boolean, darwin_dl: string, ipex_dl: string, rocm_dl: string, default_dl: string, userTempPath: string, appDataPath: string, gpuBrands: string[]) {
    this.ollama_upgraded = ollama_upgraded;
    this.ipex_upgraded = ipex_upgraded;
    this.darwin_download_link = darwin_dl;
    this.ipex_download_link = ipex_dl;
    this.rocm_download_link = rocm_dl;
    this.default_download_link = default_dl;
    this.gpuBrands = gpuBrands;
    this.userTempPath = userTempPath;
    this.unzipPath = path.join(appDataPath, 'ollama');
    if (isWindows) {
      if (gpuBrands.find(f => f.toLowerCase().startsWith('nvidia'))) {
        console.log('ollama choice: nvidia: win');
        this.archivePaths = [this.default_download_link];
        this.archiveNoGPUPath = this.default_download_link;
        this.ollamaExecutable = 'ollama.exe';
        this.ollamaArgs = ['serve'];
        this.ollamaNoGPUArgs = ['serve'];
      } else if (gpuBrands.find(f => f.toLowerCase().startsWith('amd')) || gpuBrands.find(f => f.toLowerCase().startsWith('advanced'))) {
        console.log('ollama choice: amd: win');
        this.archivePaths = [this.default_download_link, this.rocm_download_link];
        this.archiveNoGPUPath = this.default_download_link;
        this.ollamaExecutable = 'ollama.exe';
        this.ollamaArgs = ['serve'];
        this.ollamaNoGPUArgs = ['serve'];
      } else if (gpuBrands.find(f => f.toLowerCase().startsWith('intel'))) {
        console.log('ollama choice: ipex: win');
        this.archivePaths = [this.ipex_download_link];
        this.archiveNoGPUPath = this.default_download_link;
        this.ollamaArgs = [];
        this.ollamaNoGPUArgs = ['serve'];
        this.ollamaExecutable = 'ollama-serve.bat';
        this.isIPEX = true;
      } else {
        console.log('ollama choice: nogpu: win');
        this.archivePaths = [this.default_download_link];
        this.archiveNoGPUPath = this.default_download_link;
        this.ollamaExecutable = 'ollama.exe';
        this.ollamaNoGPUArgs = ['serve'];
        this.ollamaArgs = ['serve'];        
      }
    } else if (isMac) {
      console.log('ollama choice: darwin');
      this.archivePaths = [this.darwin_download_link];
      this.archiveNoGPUPath = this.darwin_download_link;
      this.ollamaExecutable = 'ollama-darwin';
      this.ollamaArgs = ['serve'];
      this.ollamaNoGPUArgs = ['serve'];
    }    
  }

  register = (webContents: Electron.WebContents | undefined) => {
    this.webContents = webContents;
    ipcMain.on('ollama', async (event: any, arg: any) => {
      const { callbackId, command, params }= arg;
      console.log('ollama:', callbackId, command, params)
      let response: any = {}
      try {
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
            this.managedExternally = false;
            if (this.isExtracting) {
              response = { status: 'error', error: 'extraction' };
            } else {
              response = this.start(params.gpuAccel);
            }
          }
          break;
          case "stop": {
            response = this.stop();
          }
          break;        
          case "find": {
            response = await this.findOllama();
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
          case "gpuAccel": {
            const { gpuAcceleration } = params;

            let archivePaths: string[] = this.archivePaths;
            let unzipPath = this.unzipPath
            await this.stop();

            if (!gpuAcceleration) {
              archivePaths = [this.archiveNoGPUPath];
              unzipPath = unzipPath + '-nogpu';              
            }

            await this.extract(archivePaths, unzipPath, 1);
            
            response = { status: 'ok', data: 'gpu-accel-change' };
            // TODO: startup is DIFFERENT FOR GPU AND NON GPU ACCEL MUST SAVE TO ENVIRONMENT!

          }
          break;        
          default: {
            response = { error: 'unknown command' };
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

  emit = (args: any) => {
    // const ev: any = JSON.parse(args);
    // console.log('event:', ev);
    this.webContents?.send('event', {
      response: args
    })                
  }

  findOllama = async (): Promise<any> => {
    const processes: ProcessInfo[] = await find('port', '11434');
    if (processes.length === 0) {
      console.error('Cannot find Ollama process:', processes);
    } else {
      this.ollamaPID = processes[0].pid;      
    }
    return { 
      ollamaPID: this.ollamaPID
    }
  }

  delay = (ms: number) => {
    return new Promise((resolve) => {
      setTimeout(resolve, ms);
    });
  }

  download = async (url: string, tempFile: string, cb: () => void): Promise<void> => {
    console.log('downloading:preparing:' , url, 'to', tempFile);
    
    const response: Response = await fetch(url);    
    if (response.ok && response.body) {
      const reader = response.body.getReader();
      const hl: string | null = response.headers.get('content-length');
      const totalLength: number = parseInt(hl ? hl : '-1', 10);
      console.log('downloading:start:length', totalLength);
      
      // Step 3: read the data
      let receivedLength: number = 0; // received that many bytes at the moment
      let chunks = []; // array of received binary chunks (comprises the body)      
      while (true) {
        await this.delay(5);
        const { done, value } = await reader.read();

        if (done) {
          let chunksAll = new Uint8Array(receivedLength);
          let position = 0;
          for (let chunk of chunks) {
            chunksAll.set(chunk, position);
            position += chunk.length;    
          }
          fs.writeFileSync(tempFile, chunksAll);
          console.log("download:writing to file:", tempFile);            
          this.emit({ type: 'ollama-extract-extract', data: { url }});
          cb();      
          break;
        } else {
          chunks.push(value);
          receivedLength += value.length;          
          const percentage: number = Math.floor(receivedLength / totalLength * 100);
          // console.log(`received ${receivedLength} of ${totalLength} - ${percentage}`)          
          this.emit({ type: 'ollama-download', data: { percentage, url, gpuBrands: this.gpuBrands } });          
        }        
      }
    } else {
      throw new Error(JSON.stringify(response));
    }
  }
  
  /*
  download = (url: string, tempFile: string, cb: () => void): fs.WriteStream => {
    console.log('downloading:prepare:' , url)

    const writer: fs.WriteStream = fs.createWriteStream(tempFile)

    const client = url.startsWith('https') ? https : http;
    const request: http.ClientRequest = client.get(url, (res: http.IncomingMessage) => {
      const hl: string | undefined = res.headers['content-length'];
      const totalLength: number = parseInt(hl ? hl : '-1', 10);
      console.log('downloading:start:length', totalLength);
      let cur: number = 0;
      
      res.on('data', (chunk: any) => {
        try {     
          cur += chunk.length;
          const percentage: number = Math.floor(cur / totalLength * 100);
          this.emit({ type: 'ollama-download', data: { percentage, url, gpuBrands: this.gpuBrands } });
        } catch (e) {
          console.error('download:error:', e);          
        }
      })
      res.on('end', () => {
        console.log("Download complete");
        this.emit({ type: 'ollama-extract-extract', data: { url }});
        cb();
      });
      res.on('error', (err: any) => { console.error(err) })
      res.pipe(writer)      
    }) 

    return writer;
  }
  */
  
  extract = async (archivePaths: string[] = this.archivePaths, unzipPath: string = this.unzipPath, extractType: number = 0) => {
    if (this.isIPEX) {
      if (this.ipex_upgraded) {
        console.log('ipex upgrade detected', '=>', unzipPath);
        fs.rmSync(unzipPath, { force: true });        
      }             
    } else {
      if (this.ollama_upgraded) {
        console.log('ollama upgrade detected', '=>', unzipPath);
        fs.rmSync(unzipPath, { force: true });
      }             
    }
    if (!fs.existsSync(unzipPath)) {
      let i: number = 0;
      this.isExtracting = true;
      this.extractCnt = archivePaths.length;            
      for await (const dlpath of archivePaths) {
        console.log('download:extract:', dlpath, '=>', unzipPath);
        if (extractType === 0) {
          this.emit({ type: 'ollama-extract-config', data: { from: dlpath, to: unzipPath }});
        }

        if (extractType === 0) {
          this.emit({ type: 'ollama-extract-starting', data: { from: dlpath, to: unzipPath }});
        } else {
          this.emit({ type: 'ollama-gpu-accel-started', data: { from: dlpath }});
        }
        console.log("Extracting ollama files...", unzipPath);
        
        const tempZipFile: string = path.join(this.userTempPath, 'ollama'  + i + '.zip');
        i++;
        if (extractType === 0) {
          this.emit({ type: 'ollama-extract-download', data: { from: dlpath, to: tempZipFile }});
        } else {
          this.emit({ type: 'ollama-gpu-accel-download', data: { from: dlpath, to: tempZipFile } });                
        }
        
        this.download(dlpath, tempZipFile, () => {
          fs.mkdirSync(unzipPath, { recursive: true });    
          fs.createReadStream(tempZipFile)
          .pipe(unzipper.Extract({ path: unzipPath }))
          .on("close", () => {
            if (extractType === 0) {
              this.emit({ type: 'ollama-extract-done', data: unzipPath });
            } else {
              this.emit({ type: 'ollama-gpu-accel-done', data: { from: dlpath, to: unzipPath } });  
            }
            this.extractCnt--;
            if (this.extractCnt === 0) {
              this.isExtracting = false;
              console.log("Files unzipped successfully");
            }
          });          
        })        
      }
    } else {
      console.log('Already downloaded and extracted!');
    }    
  }

  start = (gpuAccel: boolean = false): any => {
    try {
            
      let args: string[] = this.ollamaArgs;
      let unzipPath = this.unzipPath;
      let ollamaExecutable = this.ollamaExecutable;
      if (!gpuAccel) {
        ollamaExecutable = 'ollama.exe';
        args = this.ollamaNoGPUArgs;
        unzipPath = this.unzipPath + '-nogpu';
      }
      const command: string = path.join(unzipPath, ollamaExecutable);

      console.log('execFile:', gpuAccel, command, args);
      this.emit({ type: 'ollama-start', data: { command, args } });

      this.ollamaProcess = spawn(
        ollamaExecutable,
        args,        
        {
          shell: true,
          cwd: unzipPath,
          stdio: [ 'ignore', 'pipe', 'pipe' ],
          windowsHide: true
        }
      )              
      if (this.ollamaProcess) {
        this.ollamaProcess.on('spawn', async () => {
          await this.findOllama();
          console.log(`Ollama process started ${this.ollamaPID}`);
          // Send event
          this.emit({ type: 'ollama-started', data: 'ok' });
          setTimeout(() => {
            this.ollama = new Ollama({ host: 'http://127.0.0.1:11434' });
            // event Ollama connection is ready
            this.isReady = true;
            this.emit({ type: 'ollama-ready', data: 'ok' });
          }, 5000)          
        })

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
            console.log(`Ollama process exited with ${code}`);
            // Send event
            this.emit({ type: 'ollama-ended', data: code ? code.toString() : '0' });
        });        
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
    if (!this.managedExternally) {
      if (this.ollamaPID > -1) {
        console.error(`Sending terminate signal to Ollama ${this.ollamaPID}!`);
        kill(this.ollamaPID, (error: any) => {
          console.error('error to sending kill to Ollama:', error);
        });
      }
      return { status: 'stopping' };
    }
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
    if (this.ollama && !this.managedExternally) {
      this.ollama.abort();
    }    
  }  
}
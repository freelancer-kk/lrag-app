import { ipcMain } from 'electron';
import { isMac } from './SystemInfo';
import { ChildProcessByStdio, spawn } from 'child_process';
import * as path from 'path';
import Stream from 'stream';
import * as fs from 'fs';
import find, { ProcessInfo } from "find-process";
import unzipper from 'unzipper';
import kill from 'tree-kill';

export interface IPrereq {
  name: string,
  win?: {
    url: string;
    cwd: string;
    executable: string;
    args: string[];
    expected_version: string;
  },
  mac?: {
    url: string;
    cwd: string;
    executable: string;
    args: string[];
    expected_version: string;
  }
}

export default class DepService {
  // Service that manages a local executable (mac and windows)
  // Spawning check if running
  // Downloading from an URL
  userTempPath: string;
  serviceName: string;
  urls: string[];
  prerequisites: IPrereq[];
  installPath: string;
  webContents: Electron.WebContents | undefined;
  servicePID: number[] | undefined;
  isReady: boolean = false;
  processName: string;
  readyCheckFunc: () => Promise<boolean>;
  installedVersion: string;
  availableVersion: string;
  isExtracting: boolean = false;
  installed: boolean = false;
  executable: string;
  execDir: string;
  args: string[];
  env: any = {};
  spawnedProcess: ChildProcessByStdio<null, Stream.Readable, Stream.Readable> | undefined;
  versionCB: () => void;  

  constructor(
    serviceName: string,
    processName: string,
    executable: string,
    execDir: string,
    args: string[],
    appDataPath: string,
    userTempPath: string,
    urls: string[],
    readyCheckFunc: () => Promise<boolean>,
    prerequisites: IPrereq[],
    installedVersion: string,
    availableVersion: string,
    versionCB: () => void,
    env: any = {}
  ) {
    this.serviceName = serviceName;
    this.processName = processName;
    this.executable = executable;
    this.execDir = execDir;
    this.args = args;
    this.urls = urls;
    this.readyCheckFunc = readyCheckFunc;
    this.prerequisites = prerequisites;
    this.installPath = path.join(appDataPath, serviceName);
    this.installedVersion = installedVersion;
    this.availableVersion = availableVersion;
    this.userTempPath = userTempPath;
    this.versionCB = versionCB;
    this.env = env;    
  }

  register = (webContents: Electron.WebContents | undefined) => {
    this.webContents = webContents;
  };

  handleCommand = async (event: any, arg: any): Promise<any> => {
    const { callbackId, command, params }= arg;
    console.log('DepService:register:', this.serviceName,':', callbackId, command, params)
    let response: any = {}
    try {
      switch (command) {
        case "isReady": {
          await this.checkReady();
          response = { isReady: this.isReady };
        }
        break;
        case "installed": {
          response = { installed: this.installed };
        }
        break;
        case "checkPrequisites": {
          response = await this.checkPrerequisites();
        }
        break;
        case "install": {
          response = await this.install();
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
        case "pause": {
          response = this.pause();
        }
        break;
        case "resume": {
          response = this.resume();
        }
        break;   
        case "find": {
          response = await this.findProcessPID();
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
    return response;
  }

  emit = (args: any) => {
    // const ev: any = JSON.parse(args);
    // console.log('event:', ev);
    this.webContents?.send('event', {
      response: args
    })                
  }

  findProcessPID = async (): Promise<any> => {
    // console.log('findByProcessName:', this.executable);
    const processes: ProcessInfo[] = await find('name', this.executable);
    if (processes.length === 0) {
      console.error('Cannot find service process:', processes);
    } else {
      // console.log('findByProcessName:', this.executable, processes, processes[0].pid);
      this.servicePID = processes.map(v => v.pid);
      return { 
        servicePID: processes[0].pid
      }
    }
    return { 
      servicePID: -1
    }
  }

  delay = (ms: number) => {
    return new Promise((resolve) => {
      setTimeout(resolve, ms);
    });
  }

  checkPrerequisites = async (): Promise<boolean> => {
    // Check prerequisite e.g ghostscript is installed if not shell link to download for windows and run installer
    // MAC OS shell link to download homebrew and run brew install ghostscript

    for await (const prereq_entry of this.prerequisites) {
      const prereqName: string = prereq_entry.name;
      const prereq: any = isMac ? prereq_entry.mac : prereq_entry.win;
      if (prereq) {
        try {            
          const prereqExec: string = path.join(prereq.cwd, prereq.executable);
          if (fs.existsSync(prereqExec)) {
            console.log('DepService:init:prereq:checkVersion', prereqExec, prereq.args);
            this.emit({ type: 'service-prereq-check-start', data: { serviceName: this.serviceName, command: prereqExec, args: prereq.args } });
          
            const prereqCheckProcess: ChildProcessByStdio<null, Stream.Readable, Stream.Readable> = spawn(
              prereq.executable,
              prereq.args,        
              {
                shell: true,
                cwd: prereq.cwd,
                stdio: [ 'ignore', 'pipe', 'pipe' ],
                windowsHide: true
              }
            )              
            if (prereqCheckProcess) {
              prereqCheckProcess.on('spawn', async () => {})
              prereqCheckProcess.stdout.on('data', (data: string) => {
                console.log(`DepService:init:prereq:stdout: ${data}`);
                this.emit({ 
                  type: 'service-prereq-check-stdout',
                  data: {
                    name: this.serviceName,
                    prereq: prereqName,
                    version: Buffer.from(data).toString(),
                    expectedVersion: prereq.expectedVersion,
                    url: prereq.url,
                  }
                });
              })            
              prereqCheckProcess.stderr.on("data", (data: string) => {
                console.error(`DepService:init:prereq:stderr: ${data}`);              
                this.emit({ 
                  type: 'service-prereq-check-stderr',
                  data: {
                    serviceName: this.serviceName,
                    prereq: prereqName,
                    text: Buffer.from(data).toString(),
                  }
                });
              });
              prereqCheckProcess.on('exit', (code: number | null) => {
                console.log(`DepService:init:prereq:exit: ${code}`);
                this.emit({ 
                  type: 'service-prereq-check-exit',
                  data: {
                    serviceName: this.serviceName,
                    prereq: prereqName,
                    exitCode: code ? code.toString() : '0'
                  }
                });
              });        
            } else {
              console.error('No valid process for prerequisite', prereqExec, prereq.args);            
            }          
          } else {
            // Not installed, cannot start service emit event
            this.emit({ 
              type: 'service-prereq-check-notinstalled',
              data: {
                serviceName: this.serviceName,
                prereq: prereqName,
                version: '',
                expectedVersion: prereq.expectedVersion,
                url: prereq.url,
              }
            });          
          }
        } catch (e) {
          console.error('DepService:Prerequisite check failed:', e);
          return false;
        }      
      }
    }
    return true;
  }

  init = (): boolean => {
    return true;
  }

  download = async (url: string, targetFile: string, cb: () => void): Promise<void> => {
    console.log('DepService:downloading:prepare:' , url, 'to', targetFile);
    
    const response: Response = await fetch(url);
    if (response.ok && response.body) {
      const reader = response.body.getReader();
      const hl: string | null = response.headers.get('content-length');
      const totalLength: number = parseInt(hl ? hl : '-1', 10);
      console.log('DepService:downloading:start:length', totalLength);
      
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
          fs.writeFileSync(targetFile, chunksAll);
          console.log("DepService:download:writing to file:", targetFile);            
          this.emit({ type: 'service-download-complete', data: { serviceName: this.serviceName, url }});
          cb();      
          break;
        } else {
          chunks.push(value);
          receivedLength += value.length;          
          const percentage: number = Math.floor(receivedLength / totalLength * 100);
          // console.log(`received ${receivedLength} of ${totalLength} - ${percentage}`)          
          this.emit({ type: 'service-download-part', data: { serviceName: this.serviceName, percentage, url } });
        }        
      }
    } else {
      throw new Error(JSON.stringify(response));
    }
  }

  install = async (): Promise<boolean> => {
    if (this.availableVersion != this.installedVersion) {
      console.log('DepService:extractAndDownload:new version', this.availableVersion);
      fs.rmSync(this.installPath, { force: true });
    }

    if (!fs.existsSync(this.installPath)) {
      let i: number = 0;
      this.isExtracting = true;
      let numberOfExtracts = this.urls.length;
      for await (const dlpath of this.urls) {        
        console.log('DepService:extractAndDownload:start:', dlpath, '=>', this.installPath);         
        const tempZipFile: string = path.join(this.userTempPath, this.serviceName + i + '.zip');
        i++;
        this.emit({ 
          type: 'service-extract-download-starting',
          data: { 
            serviceName: this.serviceName,
            version: this.availableVersion,
            from: dlpath,
            to: tempZipFile
          }
        });                
        this.download(dlpath, tempZipFile, () => {
          fs.mkdirSync(this.installPath, { recursive: true });    
          fs.createReadStream(tempZipFile)
          .pipe(unzipper.Extract({ path: this.installPath }))
          .on("close", () => {
            this.emit({ 
              type: 'service-extract-download-done',
              data: { 
                serviceName: this.serviceName,
                version: this.availableVersion,
                from: dlpath,
                to: this.installPath
              }
            });                
            numberOfExtracts--;
            if (numberOfExtracts === 0) {
              this.isExtracting = false;
              this.installed = true;
              console.log("DepService:extractAndDownload:All urls downloaded and unzipped successfully");
              this.versionCB();
            }
          });          
        })        
      }
    } else {
      console.log('DepService:extractAndDownload:already downloaded and extracted!');
      this.installed = true;
    }
    return true;    
  }

  checkReady = async (): Promise<boolean> => {
    this.isReady = await this.readyCheckFunc();            
    this.emit({ 
      type: 'service-ready-state',
      data: { 
        serviceName: this.serviceName,
        version: this.availableVersion,
        ready: this.isReady,
      }
    });
    return this.isReady;
  }

  pollForServiceReady = () => {
    let cnt: number = 0;
    const tt = setInterval(async () => {      
      const isReady: boolean = await this.checkReady();
      if (isReady === true) {
        clearInterval(tt);
        console.error('DepService:poll:ready:true', this.serviceName);
      } else {
        cnt++
        if (cnt>10) {
          clearInterval(tt);
          console.error('DepService:poll:ready:timeout!', this.serviceName)
        }
      }
    }, 5000);    
  }

  start = () => {
    try {            
      const command: string = path.join(this.installPath, this.executable);
      console.log('DepService:start:execFile:', command, this.args);

      this.emit({ 
        type: 'service-start',
        data: { 
          serviceName: this.serviceName,
          version: this.availableVersion,
          command,
          args: this.args
        }
      });
      
      this.spawnedProcess = spawn(
        this.executable,
        this.args,        
        {
          shell: true,
          cwd: this.execDir,
          stdio: [ 'ignore', 'pipe', 'pipe' ],
          windowsHide: true,
          env: this.env,
        }
      )              
      if (this.spawnedProcess) {
        this.spawnedProcess.on('spawn', async () => {
          this.pollForServiceReady();          
        })

        this.spawnedProcess.stdout.on('data', (data: string) => {
          console.log(`DepService:start:stdout: ${data}`);
          this.emit({ 
            type: 'service-running-stdout',
            data: { 
              serviceName: this.serviceName,
              version: this.availableVersion,
              text: Buffer.from(data).toString(),
            }
          });
        })
        
        this.spawnedProcess.stderr.on("data", (data: string) => {
          console.error(`DepService:start:stderr: ${data}`);          
          this.emit({ 
            type: 'service-running-stderr',
            data: { 
              serviceName: this.serviceName,
              version: this.availableVersion,
              text: Buffer.from(data).toString(),
            }
          });
        });
        this.spawnedProcess.on('exit', (code: number | null) => {
          console.error(`DepService:start:exit: ${code}`);          
          this.emit({ 
            type: 'service-running-exit',
            data: {
              serviceName: this.serviceName,
              version: this.availableVersion,
              exitCode: code ? code.toString() : '0'
            }
          });
        });        
      } else {
        console.error('DepService:start:no valid process for', this.serviceName);
      }
      return { status: 'starting' };
    } catch (e) {
      console.error('DepService:start:error:', e);
      return { status: 'error', error: e };
    } 
  }

  stop = async (all: boolean = false): Promise<any> => {
    if (this.servicePID && this.servicePID.length > 0) {
      if (all) {
        for await (const pid of this.servicePID) {
          console.log(`DepService:stop:sending terminate signal to ${this.serviceName} - ${pid}!`);
          kill(pid, (error: any) => {
            console.error(`DepService:stop:error to sending kill to ${this.serviceName} - ${pid}`, error);
          });
        }
      } else {
        console.log(`DepService:stop:sending terminate signal to ${this.serviceName} - ${this.servicePID}!`);
        kill(this.servicePID[0], (error: any) => {
          console.error(`DepService:stop:error to sending kill to ${this.serviceName} - ${this.servicePID}`, error);
        });
      }
      this.emit({ 
        type: 'service-stop',
        data: {
          serviceName: this.serviceName,
          version: this.availableVersion          
        }
      });
    }
    return { status: 'stopping' };
  }

  pause = () => {    
  }

  resume = () => {    
  }  
}
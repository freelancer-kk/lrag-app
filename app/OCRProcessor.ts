import { ipcMain } from 'electron';
import DockerEnv from './DockerEnv';
import * as fs from 'fs';
import * as path from 'path';
import sftp from 'ssh2-sftp-client';

export enum EOCRStatus {
  REQUESTED = 0,
  UPLOADING,
  UPLOADED,
  PROCESSED,
  ERROR
}

const MAX_PROC_TIME = 1000 * 360;

export default class OCRProcessor {
  webContents: Electron.WebContents | undefined;
  client: sftp;
  host: string;
  port: number;
  username: string;
  password: string;
  connected: boolean = false;
  filesToProcess: any[] = [];
  jobTimer: any;
  firstTime: boolean = true;

  constructor(dockerEnv: DockerEnv) {
    this.client = new sftp();
    this.host = String(dockerEnv.getKeyValue('OCR_SFTP_HOST'));
    this.port = Number(dockerEnv.getKeyValue('OCR_SFTP_PORT'));
    this.username = String(dockerEnv.getKeyValue('OCR_USER'));
    this.password = String(dockerEnv.getKeyValue('OCR_PASSWD'));
  }

  connect = () => {
    if (!this.connected) {
      return this.client.connect({
        host: this.host,
        port: this.port,
        username: this.username,
        password: this.password,
      }).then(async () => {
        console.log('connected:ls:', await this.client.list('input'));
        this.connected = true;
        if (this.firstTime) {
          this.firstTime = false;
          this.client.on('error', (err) => {
            this.emit( { type: 'ocr-processor-error', data: { error: err.message } } );  
          })
          this.client.on('end', () => {
            this.emit( { type: 'ocr-processor-ended', data: {} } );  
          })
          this.client.on('close', () => {
            this.emit( { type: 'ocr-processor-closed', data: {} } );  
          })
        }
        this.emit( { type: 'ocr-processor-opened', data: {} } );  
        if (this.jobTimer) {
          clearInterval(this.jobTimer);
        }
        this.jobTimer = setInterval(async () => {
            if (this.filesToProcess.length === 0) {
              this.disconnect();
            } else {
              const anyWorkOrError: boolean = this.filesToProcess.findIndex(f => f.status !== EOCRStatus.REQUESTED) > -1;
              if (!anyWorkOrError) {
                const fe: any = this.filesToProcess[0];
                fe.status = EOCRStatus.UPLOADING;
                this.emit( { type: 'ocr-processor-put', data: { localfile: path.basename(fe.localfile), remotefile: fe.remotefile, status: fe.status } });
                this.client.put(
                  fs.createReadStream(fe.localfile),
                  fe.remotefile,                  
                  {
                    writeStreamOptions: {
                      encoding: null
                    }
                  }
                ).then((value: string) => {
                  console.log('putRes:', value);
                  fe.status = EOCRStatus.UPLOADED;
                  fe.timestamp = Date.now();
                  this.emit( { type: 'ocr-processor-putted', data: { localfile: path.basename(fe.localfile), remotefile: fe.remotefile, status: fe.status, putResponse: value } });
                }).catch((reason: any) => {
                  console.log('OCR:error:', reason);
                  this.processError(fe);
                })
              } else {
                // Check for timeout on the processing
                this.filesToProcess.forEach(async (fe: any, index: number) => {
                  if (fe.status === EOCRStatus.UPLOADED) {
                    if (Date.now() > (fe.timestamp + MAX_PROC_TIME)) {
                      // OCR Processing taken too long must be errored
                      // Remove the uploaded file
                      console.log('OCR:toolong:removed:', fe.remotefile);
                      this.deleteRemoteFile(fe.remotefile);
                      this.processError(fe);                      
                    } else if (await this.client.exists(fe.outputfile).catch((reason: any) => {
                      console.error('OCR:exists successfile failed:', reason);
                    })) {
                      // Completed get the ocr'd doc  
                      console.log('COMPLETED:success:', fe.outputfile)
                      this.client.fastGet(fe.outputfile, fe.localfile).then((value: string) => {
                        console.log('OCR File retrieved:', value);
                        fe.status = EOCRStatus.PROCESSED;                        
                        this.emit( { type: 'ocr-processor-complete', data: { localfile: path.basename(fe.localfile), remotefile: fe.remotefile, status: fe.status, getResponse: value } });
                        this.deleteRemoteFile(fe.outputfile);
                      }).catch((reason: any) => {
                        console.error('OCR Error during get:', reason);
                        this.deleteRemoteFile(fe.remotefile);    
                        this.processError(fe);
                      })

                    } else if (await this.client.exists(fe.errorfile).catch((reason: any) => {
                      console.error('OCR:exists errorfile failed:', reason);
                    })) {
                      // Error get the error doc
                      this.deleteRemoteFile(fe.errorfile);
                      console.log('OCR:COMPLETED with error:', fe.errorfile)
                      this.processError(fe);
                    }
                  }
                })
                for await (const fe of this.filesToProcess) {
                  if (fe.status === EOCRStatus.ERROR || fe.status === EOCRStatus.PROCESSED) {
                    const fIdx: number = this.filesToProcess.findIndex(f => f.remotefile === fe.remotefile);
                    this.filesToProcess.splice(fIdx, 1);
                  }
                }
              }
            }
        }, 5000);
      }).then(data => {
        console.log(data, 'the data info');
      }).catch(err => {
        console.error(err, 'catch error');      
      });
    }
  }

  deleteRemoteFile = (remotefile: string): Promise<string | void> => {
    return this.client.delete(remotefile).catch((reason: any) => {
      console.error('OCR:delete failed:', reason);      
    })
  }

  processError = (fe: any) => {
    this.emit( { type: 'ocr-processor-error', data: { localfile: path.basename(fe.localfile), remotefile: fe.remotefile, status: fe.status, timestamp: fe.timestamp } });      
    fe.status = EOCRStatus.ERROR;
  }

  disconnect = (): Promise<boolean> => {
    return this.client.end().then((value: boolean) => {
      if (value) {
        this.connected = false;        
        clearInterval(this.jobTimer);
        this.jobTimer = undefined;
      }
      return value;
    })
  }

  put = (localfile: string, remotefile: string) => {
    if (this.filesToProcess.findIndex(f => f.localfile === localfile) === -1) {
      this.filesToProcess.push({
        localfile,
        remotefile: 'input/' +  remotefile,
        outputfile: 'output/' +  remotefile,
        errorfile: 'error/' +  remotefile,
        status: EOCRStatus.REQUESTED,
        timestamp: Date.now(),
      });
    }
  }

  register = (webContents: Electron.WebContents | undefined) => {
      this.webContents = webContents;
      ipcMain.on('ocr-process', async (event: any, arg: any) => {
        const { callbackId, command, params }= arg;
        console.log('OCRService:', callbackId, command, params)
        let response: any = {}
        switch (command) {
          case "start": {}
          break;        
        }
        event.reply('reply', {
          callbackId,
          response: JSON.stringify(response)
        })
      }) 
    }
  
    emit = (args: any) => {
      this.webContents?.send('ocr-event', {
        response: args
      })                
    }

}
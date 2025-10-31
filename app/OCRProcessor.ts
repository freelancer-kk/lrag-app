import { ipcMain } from 'electron';
import DockerEnv from './DockerEnv';
import * as fs from 'fs';
import * as path from 'path';
import WatcherService from './WatcherService';

export enum EOCRStatus {
  REQUESTED = 0,
  UPLOADING,
  UPLOADED,
  PROCESSED,
  ERROR
}

const MAX_PROC_TIME = 1000 * 720;

export default class OCRProcessor {
  webContents: Electron.WebContents | undefined;
  filesToProcess: any[] = [];
  jobTimer: any;
  firstTime: boolean = true;
  docRootPath: string;
  docOkfile: string;
  watcherService: WatcherService;

  constructor(watcherService: WatcherService, dockerEnv: DockerEnv) {
    this.watcherService = watcherService;
    this.docRootPath = String(dockerEnv.getKeyValue('DOC_SOURCE_PATH'));
    this.docOkfile = path.join(this.docRootPath, 'okfile');
    fs.writeFileSync(this.docOkfile, 'ok');
                  
    console.log('OCRProcessor:local:', this.docRootPath);
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

  disconnect = (): boolean => {
    clearInterval(this.jobTimer);
    this.jobTimer = undefined;
    return true;
  }  

  connect = () => {
    console.log('connected:ls:', this.watcherService.list('input'));
    if (this.firstTime) {
      this.firstTime = false;      
      this.emit( { type: 'ocr-processor-opened', data: {} } );  
      if (this.jobTimer) {
        clearInterval(this.jobTimer);
      }
      
      this.jobTimer = setInterval(() => {
        if (this.filesToProcess.length === 0) {
          this.disconnect();
        } else {

          const anyWorkOrError: boolean = this.filesToProcess.filter(f => f.status !== EOCRStatus.REQUESTED).length > 0;
          if (!anyWorkOrError) {
            const fe: any = this.filesToProcess[0];
            fe.status = EOCRStatus.UPLOADING;
            this.emit( { type: 'ocr-processor-put', data: { localfile: fe.localfile, remotefile: fe.remotefile, status: fe.status } });
            this.watcherService.put(
              fe.localfile,
              fe.remotefile,                  
            );
            fe.status = EOCRStatus.UPLOADED;
            fe.timestamp = Date.now();
            this.emit( { type: 'ocr-processor-putted', data: { localfile: fe.localfile, remotefile: fe.remotefile, status: fe.status, putResponse: 'ok' } });
            const targetOkFile: string = fe.remotefile + '.ok';
            console.log('putRes:writing ok file', targetOkFile);              
            this.watcherService.put(
              this.docOkfile,
              targetOkFile
            )
          } else {
            // Check for timeout on the processing
            for (const fe of this.filesToProcess) {
              // console.log('OCR:check:', fe);
              if (fe.status === EOCRStatus.UPLOADED) {
                if (Date.now() > (fe.timestamp + MAX_PROC_TIME)) {
                  // OCR Processing taken too long must be errored
                  // Remove the uploaded file
                  console.log('OCR:toolong:removed:', fe.remotefile);
                  this.watcherService.delete(fe.remotefile);
                  this.processError(fe);                  
                } else {
                  if (this.watcherService.exists(fe.outputfile)) {
                    console.log('COMPLETED:success:', fe.outputfile)
                    this.watcherService.get(fe.outputfile, fe.localfile);
                    fe.status = EOCRStatus.PROCESSED;
                    console.log('OCR File retrieved:');
                    this.emit( { type: 'ocr-processor-complete', data: { localfile: fe.localfile, remotefile: fe.remotefile, status: fe.status, getResponse: 'ok' } });
                    this.watcherService.delete(fe.outputfile);
                  }
                    
                  if (this.watcherService.exists(fe.errorfile)) {
                    // Error get the error doc
                    console.log('OCR:COMPLETED with error:', fe.errorfile)
                    this.watcherService.delete(fe.errorfile);
                    this.processError(fe);
                  }        
                }
              } else if (fe.status === EOCRStatus.ERROR || fe.status === EOCRStatus.PROCESSED) {
                const fIdx: number = this.filesToProcess.findIndex(f => f.remotefile === fe.remotefile);
                this.filesToProcess.splice(fIdx, 1);
              } else {
                console.log('Waiting for status change:', fe)
              }
            }                
          }        
        }
      }, 5000);      
    }
  }

  processError = (fe: any) => {
    this.emit( { type: 'ocr-processor-error', data: { localfile: fe.localfile, remotefile: fe.remotefile, status: fe.status, timestamp: fe.timestamp } });      
    fe.status = EOCRStatus.ERROR;
  }

  put = (localfile: string, remotefile: string) => {
    if (this.filesToProcess.findIndex(f => f.localfile === localfile) === -1) {
      this.filesToProcess.push({
        localfile,
        remotefile: path.join('input', remotefile),
        outputfile: path.join('output', remotefile),
        errorfile: path.join('error', remotefile),
        status: EOCRStatus.REQUESTED,
        timestamp: Date.now(),
      });
    }
  }
}
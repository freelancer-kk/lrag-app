import * as fs from 'fs';
import * as path from 'path';
import log from 'electron-log/main';
import ImageToTextProcessor from './ImageToTextProcessor';
import { createWorker } from 'tesseract.js';

export const MAX_PROC_TIME = 1000 * 720;

enum EOCLlmStatus {
  REQUESTED = 0,
  PROCESSING,
  PROCESSED,
  CLEANED,
  ERROR
}

const BATCH_SIZE = 1;
export default class OCRJSProcessor {
  webContents: Electron.WebContents | undefined;
  filesToProcess: any[] = [];
  jobTimer: any;
  imageToTextProcessor: ImageToTextProcessor;
  workers: Tesseract.Worker[] = [];
  
  constructor(userTempPath: string) {
    this.imageToTextProcessor = new ImageToTextProcessor(userTempPath, BATCH_SIZE);
  }
 
  register = (webContents: Electron.WebContents | undefined) => {
    this.webContents = webContents;    
  }

  emit = (args: any) => {
    this.webContents?.send('ocr-local-event', {
      response: args
    })                
  }

  init = async () => {
    if (this.workers.length === 0) {
      for (let i = 0; i < BATCH_SIZE; i++) {
        log.info(`Initializing workers OCR JS instance ${i + 1} of ${BATCH_SIZE}`);
        this.workers.push(await createWorker());
      }
    }
  }

  destroy = async () => {
    for (let i = 0; i < BATCH_SIZE; i++) {
      await this.workers[i].terminate();
    }
    this.workers = [];
  }

  threadJS = (feobj: any, counter: number, total: number, batchIdx: number, imagePath: string): Promise<any> => {
    log.info('Converting with tesseract js:', counter, total, batchIdx, imagePath);
    return this.workers[batchIdx].recognize(
      imagePath
    ).then((response: Tesseract.RecognizeResult) => {
      try {
        const text: string = response.data.text;
        log.info('Received response from OCR JS:', text.length);
        this.emit({ type: 'ocr-local-images-to-local-progress', data: {
            path: imagePath,
            counter,
            total
          }
        });            
        return {
          batchIdx,
          response: text
        };
      } catch (e) {
        // log.error(e);
        this.processError(feobj, counter, total);  
        return {
          batchIdx,
          response: 'ERROR'
        };
      }
    }).catch((reason: any) => {
      // log.error(reason);
      this.processError(feobj, counter, total);
    })       
  }

  imagesToText = async (feObj: any, imagePaths: string[]): Promise<string> => {
    return this.imageToTextProcessor.imagesToText(feObj, imagePaths, this.threadJS);
  }

  start = () => {
    this.emit( { type: 'ocr-local-processor-opened', data: {} } );  
    if (this.jobTimer) {
      clearInterval(this.jobTimer);
    }
    
    this.jobTimer = setInterval(async () => {
      if (this.filesToProcess.length > 0) {
        const anyWorkOrError: boolean = this.filesToProcess.filter(f => f.status !== EOCLlmStatus.REQUESTED).length > 0;
        if (!anyWorkOrError) {
          const fe: any = this.filesToProcess[0];
          fe.status = EOCLlmStatus.PROCESSING;
          this.emit({ type: 'ocr-local-processor-start', data: { localfile: fe.localfile, status: fe.status } });
          await this.init();

          const fn: string = path.basename(fe.localfile);
          const imagePaths: string[] = await this.imageToTextProcessor.pdfToImages(
            fe.localfile,
            fn,
            this.emit
          );

          let markdown: string = '';
          fe.imagePaths = imagePaths;
          fe.timestamp = Date.now();

          try {
            markdown = await this.imagesToText(fe, imagePaths);
            fe.markdown = markdown;
            fe.status = EOCLlmStatus.PROCESSED;            
            this.emit( { type: 'ocr-local-processor-finish', data: { localfile: fe.localfile, status: fe.status, ocrResponse: 'ok' } });
          } catch (e) {
            this.processError(fe, 0, 0);            
          }           
        } else {
          for (const fe of this.filesToProcess) {
            if (fe.status === EOCLlmStatus.ERROR) {
              await this.imageToTextProcessor.removeImagePaths(fe.imagePaths);
              fe.status = EOCLlmStatus.CLEANED;
            } else if (fe.status === EOCLlmStatus.PROCESSED) {
              await this.imageToTextProcessor.removeImagePaths(fe.imagePaths);
              const outputMdPath: string = fe.localfile + '.txt';
              fs.unlinkSync(fe.localfile);
              await fs.promises.writeFile(outputMdPath, fe.markdown, 'utf-8');          
              log.info('OCR:JS:converted to text:', outputMdPath);
              this.emit( { type: 'ocr-local-processor-complete', data: { localfile: fe.localfile, mdlocalfile: outputMdPath, status: fe.status, ocrResponse: 'ok' } });
              fe.status = EOCLlmStatus.CLEANED;
            } else if (fe.status === EOCLlmStatus.CLEANED) {
              const fIdx: number = this.filesToProcess.findIndex(f => f.localfile === fe.localfile);
              this.filesToProcess.splice(fIdx, 1);
              if (this.filesToProcess.length === 0) {
                await this.destroy();
                this.emit( { type: 'ocr-local-processor-all-complete', data: {} });                           
              } 
            }
          }          
        }
      }
    }, 500);     
  }

  processError = (fe: any, counter: number, total: number) => {
    this.emit( { type: 'ocr-local-processor-error', data: { localfile: fe.localfile, counter, total } }); 
    fe.status = EOCLlmStatus.ERROR;
  }

  put = (localfile: string) => {
    if (this.filesToProcess.findIndex(f => f.localfile === localfile) === -1) {
      this.filesToProcess.push({
        localfile,
        status: EOCLlmStatus.REQUESTED,
        timestamp: Date.now(),
      });
    } else {
      log.info('OCRJSProcessor:put:already exists:', this.filesToProcess.find(f => f.localfile === localfile))
    }
  }
}
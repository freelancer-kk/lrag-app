import * as fs from 'fs';
import * as path from 'path';
import log from 'electron-log/main';
import OllamaService from './OllamaService';
import { Ollama, OllamaInput } from "@langchain/ollama";
import ImageToTextProcessor from './ImageToTextProcessor';

enum EOCLlmStatus {
  REQUESTED = 0,
  PROCESSING,
  PROCESSED,
  CLEANED,
  ERROR
}

const BATCH_SIZE = 1;
export default class OCRllmProcessor {
  webContents: Electron.WebContents | undefined;
  ollama_url: string;
  ollamaService: OllamaService;
  ollamaOCRLlm: Ollama[] = [];
  filesToProcess: any[] = [];
  jobTimer: any;
  lastocrmodel: string = '';
  prompt: string = 'Convert the document to markdown.';
  ollamaOptions: any;
  imageToTextProcessor: ImageToTextProcessor;
  
  constructor(ollama_url: string, ollamaService: OllamaService, userTempPath: string) {
    this.ollama_url = ollama_url;
    this.ollamaService = ollamaService;
    this.imageToTextProcessor = new ImageToTextProcessor(userTempPath, BATCH_SIZE);
  }
 
  init = async (ocrobj: any) => {
    this.prompt = ocrobj.prompt;
    if (ocrobj.model !== this.lastocrmodel) {         
      this.lastocrmodel = ocrobj.model;

      await this.ollamaService.unloadLastUsedModel();
      this.ollamaService.setLastUsedModel(ocrobj.model);
      
      const ollamaOptions: OllamaInput = {
          ...{
            baseUrl: this.ollama_url,
            model: ocrobj.model,
            headers: this.ollamaService.headers ? this.ollamaService.headers : undefined,
            maxConcurrency: BATCH_SIZE            
          },
          ...ocrobj.params
      };  
      log.info('Ollama ocr llm connection:options:', ollamaOptions);
      this.ollamaOptions = ollamaOptions;
      this.ollamaOCRLlm = [];
      for (let i = 0; i < BATCH_SIZE; i++) {
        log.info(`Initializing Ollama OCR LLM instance ${i + 1} of ${BATCH_SIZE}`);
        this.ollamaOCRLlm.push(new Ollama(ollamaOptions));
      }
      
      log.info('Ollama ocr llm connection initialized');
    }
  }

  register = (webContents: Electron.WebContents | undefined) => {
    this.webContents = webContents;    
  }
  
  emit = (args: any) => {
    this.webContents?.send('ocr-local-event', {
      response: args
    })                
  }

  threadOllama = (feObj: any, counter: number, total: number, batchIdx: number, image: string): Promise<any> => {
    log.info('Sending prompt to Ollama OCR LLM:', counter, total, batchIdx);
    
    return this.ollamaOCRLlm[batchIdx].invoke(        
      this.prompt, {
        images: [image],            
      },
    ).then((response: string) => {                    
      try {
        log.info('Received response from Ollama OCR LLM:', response.length);
        this.emit({ type: 'ocr-local-images-to-local-progress', data: {
            path: image.length,
            counter,
            total
          }
        });
        return {
          batchIdx,
          response
        };
      } catch (e) {
        log.error(e);
        this.processError(feObj, counter, total);  
        return {
          batchIdx,
          response: 'ERROR'
        };
      }      
    })
    .catch((reason: any) => {
      log.error(reason);
      this.processError(feObj, counter, total);
    });    
  }

  imagesToMarkdown = async (feObj: any, imagePaths: string[]): Promise<string> => {
    if (!this.ollamaOCRLlm) {
      throw new Error('Ollama OCR LLM not initialized');
    }

    return this.imageToTextProcessor.b64imagesToText(feObj, imagePaths, this.threadOllama);
  }

  start = () => {
    this.emit( { type: 'ocr-processor-opened', data: {} } );  
    if (this.jobTimer) {
      clearInterval(this.jobTimer);
    }
    
    this.jobTimer = setInterval(async () => {
      if (this.filesToProcess.length > 0) {
        const anyWorkOrError: boolean = this.filesToProcess.filter(f => f.status !== EOCLlmStatus.REQUESTED).length > 0;
        if (!anyWorkOrError) {
          const fe: any = this.filesToProcess[0];
          fe.status = EOCLlmStatus.PROCESSING;
          this.emit( { type: 'ocr-local-processor-start', data: { localfile: fe.localfile, status: fe.status } });

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
            markdown = await this.imagesToMarkdown(fe, imagePaths);
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
              const outputMdPath: string = fe.localfile + '.md';
              fs.unlinkSync(fe.localfile);            
              await fs.promises.writeFile(outputMdPath, fe.markdown, 'utf-8');          
              log.info('OCR:LLM:converted to md:', outputMdPath);
              this.emit( { type: 'ocr-local-processor-complete', data: { localfile: fe.localfile, mdlocalfile: outputMdPath, status: fe.status, ocrResponse: 'ok' } });                          
              fe.status = EOCLlmStatus.CLEANED;
            } else if (fe.status === EOCLlmStatus.CLEANED) {
              const fIdx: number = this.filesToProcess.findIndex(f => f.localfile === fe.localfile);
              this.filesToProcess.splice(fIdx, 1);
              if (this.filesToProcess.length === 0) {
                this.emit( { type: 'ocr-local-processor-all-complete', data: {} });
                log.info('OCR:LLM:Freeing up ocr model:', this.lastocrmodel);                
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
      log.info('OCRLlmProcessor:put:already exists:', this.filesToProcess.find(f => f.localfile === localfile))
    }
  }
}
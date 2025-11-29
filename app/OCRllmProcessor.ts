import { ipcMain } from 'electron';
import { pdf } from "pdf-to-img";
import * as fs from 'fs';
import * as path from 'path';
import log from 'electron-log/main';
import OllamaService from './OllamaService';
import { Ollama, OllamaInput } from "@langchain/ollama";
import * as PImage from "pureimage";

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
  ollamaService: OllamaService;
  ollamaOCRLlm: Ollama[] = [];
  filesToProcess: any[] = [];
  jobTimer: any;
  doc_processor_path: string;
  lastocrmodel: string = '';
  prompt: string = 'Convert the document to markdown.';
  ollamaOptions: any;
  
  constructor(ollamaService: OllamaService, userTempPath: string) {
    this.ollamaService = ollamaService;
    this.doc_processor_path = path.join(userTempPath, 'doc_processor');
    fs.mkdirSync(this.doc_processor_path, { recursive: true });  
    log.info('doc_processor_path:', this.doc_processor_path);
  }
 
  init = async (ocrobj: any) => {
    this.prompt = ocrobj.prompt;
    if (ocrobj.model !== this.lastocrmodel) {         
      this.lastocrmodel = ocrobj.model;

      await this.ollamaService.unloadLastUsedModel();

      this.ollamaService.setLastUsedModel(ocrobj.model);
      const ollamaOptions: OllamaInput = {
          ...{
            baseUrl: 'http://127.0.0.1:11434',
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
    ipcMain.on('ocr-llm-process', async (event: any, arg: any) => {
      const { callbackId, command, params }= arg;
      log.info('OCRLlmProcessor:', callbackId, command, params)
      let response: any = {}
      switch (command) {
        case "convert": {}
        break;        
      }
      event.reply('reply', {
        callbackId,
        response: JSON.stringify(response)
      })
    }) 
  }
  
  emit = (args: any) => {
    this.webContents?.send('ocr-llm-event', {
      response: args
    })                
  }

  convertToGrayscale = async (inputPath: string, outputPath: string): Promise<void> => {
    try {
      let img: any;

      // 1. Load the image based on file extension
      if (inputPath.endsWith('.png')) {
          img = await PImage.decodePNGFromStream(fs.createReadStream(inputPath));
      } else if (inputPath.endsWith('.jpg') || inputPath.endsWith('.jpeg')) {
          img = await PImage.decodeJPEGFromStream(fs.createReadStream(inputPath));
      } else {
          console.error("Unsupported file type. Use .png or .jpg");
          return;
      }

      // 2. Get image data using the typed context
      const ctx: CanvasRenderingContext2D = img.getContext("2d");
      const imageData: ImageData = ctx.getImageData(0, 0, img.width, img.height);
      const data: Uint8ClampedArray = imageData.data;

      // 3. Process pixels: Loop through the data array by increments of 4 (R, G, B, A)
      for (let i = 0; i < data.length; i += 4) {
          // Apply the standard luminance grayscale formula
          const grayscale = (0.2126 * data[i]) + (0.7152 * data[i + 1]) + (0.0722 * data[i + 2]);

          // Set R, G, and B channels to the same grayscale value
          data[i] = grayscale;     // Red
          data[i + 1] = grayscale; // Green
          data[i + 2] = grayscale; // Blue
          // Alpha channel (data[i + 3]) remains unchanged
      }

      // 4. Save the image to a new file as a PNG
      await PImage.encodePNGToStream(img, fs.createWriteStream(outputPath));
      console.log(`Successfully converted image to grayscale and saved to ${outputPath}`);
    } catch (e) {
        console.error("An error occurred during image processing:", e);
    }
  }

  pdfToImages = async (pdfPath: string, outputDir: string): Promise<string[]> => {
    try {
        const options = {
          scale: 2.0,
          format: 'png',
          
        };
        let counter: number = 1;
        const document: any = await pdf(pdfPath, options);
        const imagePaths: string[] = [];
        for await (const image of document) {
          const imagePath: string = path.join(outputDir, `page${counter}.png`);
          await fs.writeFileSync(imagePath, image);
          const targetImagePath: string = path.join(outputDir, `page${counter}.jpg`);
          await this.convertToGrayscale(imagePath, targetImagePath);
          imagePaths.push(targetImagePath);          
          this.emit({ type: 'ocr-llm-pdf-to-image-progress', data: {
              path: pdfPath,
              counter,
              total: document.length
            }
          });
          counter++;
        }
        return imagePaths
    } catch (error) {
        console.error("Error converting PDF to images:", error);
        throw error;
    }
  }

  threadOllama = (counter: number, total: number, batchIdx: number, image: string): Promise<any> => {
      try {
        log.info('Sending prompt to Ollama OCR LLM:', counter, total, batchIdx);
        
        // const ollamaConn: Ollama = new Ollama(this.ollamaOptions);
        // return ollamaConn.invoke(
        return this.ollamaOCRLlm[batchIdx].invoke(        
          this.prompt, {
            images: [image],            
          },
        ).then(async (response: string) => {                    
          log.info('Received response from Ollama OCR LLM:', response.length);
          this.emit({ type: 'ocr-llm-images-to-markdown-progress', data: {
              path: image.length,
              counter,
              total
            }
          });
          return {
            batchIdx,
            response
          };
        });
      } catch (error) {
        console.error(`Error processing image to md ${counter} with Ollama OCR LLM:`, error);
        throw error;
      }    
  }

  delay = (ms: number) => {
    return new Promise((resolve) => {
      setTimeout(resolve, ms);
    });
  }

  imagesToMarkdown = async (imagePaths: string[]): Promise<string> => {
    if (!this.ollamaOCRLlm) {
      throw new Error('Ollama OCR LLM not initialized');
    }

    let combinedMarkdown: string = '';
    let counter: number = 1;    
    let images: string[] = [];
    for await (const imagePath of imagePaths) {
      try {
        const imageData: string = fs.readFileSync(imagePath).toString('base64');
        images.push(imageData);
        if (counter % BATCH_SIZE === 0 || counter === imagePaths.length) {
          const promiseArray: Promise<string>[] = [];
          let i = 0;
          for await (const imageData of images) {
            promiseArray.push(this.threadOllama(counter, imagePaths.length, i, imageData));
            i++;
          }
          const responses: any[] = await Promise.all(promiseArray);
          responses.sort((a, b) => a.batchIdx - b.batchIdx);
          combinedMarkdown += responses.map(f => f.response).join('\n\n');
          images = [];
        }        
      } catch (error) {
        console.error(`Error processing image to md ${imagePath} with Ollama OCR LLM:`, error);
        throw error;
      }
      counter++;
    }
    

    return combinedMarkdown;
  }

  removeImagePaths = async (imagePaths: string[]): Promise<void> => {
    fs.rmSync(path.dirname(imagePaths[0]), { recursive: true });
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
          this.emit( { type: 'ocr-llm-processor-start', data: { localfile: fe.localfile, status: fe.status } });

          const fn: string = path.basename(fe.localfile);
          await fs.mkdirSync(path.join(this.doc_processor_path, fn), { recursive: true });

          const imagePaths: string[] = await this.pdfToImages(
            fe.localfile,
            path.join(this.doc_processor_path, fn)
          );

          const markdown: string = await this.imagesToMarkdown(imagePaths);
          fe.status = EOCLlmStatus.PROCESSED;
          fe.imagePaths = imagePaths;
          fe.markdown = markdown;
          fe.timestamp = Date.now();

          this.emit( { type: 'ocr-llm-processor-finish', data: { localfile: fe.localfile, status: fe.status, ocrResponse: 'ok' } });
        } else {
          for (const fe of this.filesToProcess) {
            if (fe.status === EOCLlmStatus.PROCESSED) {
              await this.removeImagePaths(fe.imagePaths);
              const outputMdPath: string = fe.localfile + '.md';
              fs.unlinkSync(fe.localfile);            
              await fs.promises.writeFile(outputMdPath, fe.markdown, 'utf-8');          
              log.info('OCR:LLM:converted to md:', outputMdPath);
              this.emit( { type: 'ocr-llm-processor-complete', data: { localfile: fe.localfile, mdlocalfile: outputMdPath, status: fe.status, ocrResponse: 'ok' } });                          
              fe.status = EOCLlmStatus.CLEANED;
            } else if (fe.status === EOCLlmStatus.CLEANED) {
              const fIdx: number = this.filesToProcess.findIndex(f => f.localfile === fe.localfile);
              this.filesToProcess.splice(fIdx, 1);
              if (this.filesToProcess.length === 0) {
                this.emit( { type: 'ocr-llm-processor-all-complete', data: {} });
                log.info('OCR:LLM:Freeing up ocr model:', this.lastocrmodel);                
              } 
            }
          }          
        }
      }
    }, 500);     
  }

  processError = (fe: any) => {
    this.emit( { type: 'ocr-llm-processor-error', data: { localfile: fe.localfile, status: fe.status, timestamp: fe.timestamp } });      
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
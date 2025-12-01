import { pdf } from "pdf-to-img";
import * as fs from 'fs';
import * as path from 'path';
import log from 'electron-log/main';
import * as PImage from "pureimage";

export default class ImageToTextProcessor {
  doc_processor_path: string;
  batch_size: number;
  
  constructor(userTempPath: string, batch_size: number) {
    this.doc_processor_path = path.join(userTempPath, 'doc_processor');
    this.batch_size = batch_size;
    fs.mkdirSync(this.doc_processor_path, { recursive: true });  
    log.info('doc_processor_path:', this.doc_processor_path);
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

  pdfToImages = async (pdfPath: string, fn: string, cb: (args: any) => void): Promise<string[]> => {
    await fs.mkdirSync(path.join(this.doc_processor_path, fn), { recursive: true });          
    const outputDir: string = path.join(this.doc_processor_path, fn);
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
          cb({ type: 'ocr-pdf-to-image-progress', data: {
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

  b64imagesToText = async (feObj: any, imagePaths: string[], cb: (feObj: any, counter: number, imgLengths: number, index: number, imageData: string) => Promise<any>): Promise<string> => {
    let combinedMarkdown: string = '';
    let counter: number = 1;    
    let images: string[] = [];    
    try {
      for await (const imagePath of imagePaths) {
        const imageData: string = fs.readFileSync(imagePath).toString('base64');
        images.push(imageData);
        if (counter % this.batch_size === 0 || counter === imagePaths.length) {
          const promiseArray: Promise<any>[] = [];
          let i = 0;
          for await (const imageData of images) {
            promiseArray.push(cb(feObj, counter, imagePaths.length, i, imageData));
            i++;
          }
          const responses: any[] = await Promise.all(promiseArray);
          responses.sort((a, b) => a.batchIdx - b.batchIdx);
          combinedMarkdown += responses.map(f => f.response).join('\n\n');
          images = [];
        }        
        counter++;
      }

      return combinedMarkdown;
    } catch (error) {
      console.error(`Error processing image to text ${imagePaths} with Ollama OCR image:`, error);
      throw error;
    } 
  }

  imagesToText = async (feObj: any, imagePaths: string[], cb: (feObj: any, counter: number, imgLengths: number, index: number, imageData: string) => Promise<any>): Promise<string> => {
    let combinedMarkdown: string = '';
    let counter: number = 1;    
    let images: string[] = [];    
    try {
      for await (const imagePath of imagePaths) {
        images.push(imagePath);
        if (counter % this.batch_size === 0 || counter === imagePaths.length) {
          const promiseArray: Promise<any>[] = [];
          let i = 0;
          for await (const imagePath of images) {
            promiseArray.push(cb(feObj, counter, imagePaths.length, i, imagePath));
            i++;
          }
          const responses: any[] = await Promise.all(promiseArray);
          responses.sort((a, b) => a.batchIdx - b.batchIdx);
          combinedMarkdown += responses.map(f => f.response).join('\n\n');
          images = [];
        }        
        counter++;
      }

      return combinedMarkdown;
    } catch (error) {
      console.error(`Error processing image to text ${imagePaths} with Ollama OCR image:`, error);
      throw error;
    } 
  }

  removeImagePaths = async (imagePaths: string[]): Promise<void> => {
    fs.rmSync(path.dirname(imagePaths[0]), { recursive: true });
  }  
}
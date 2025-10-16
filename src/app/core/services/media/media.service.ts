import { Injectable } from '@angular/core';
import { SystemService } from '../system/system.service';

@Injectable({
  providedIn: 'root'
})
export class MediaService {
  fileSizeUnit: number = 1024;
  public isApiSetup = false;
  docStatus: any[] | undefined = undefined;
  files: string[] = [];
  loadedIndex: boolean = false;

  constructor(
    private systemService: SystemService
  ) {}

  getFileSize = (fileSize: number): number => {
    if (fileSize > 0) {
      if (fileSize < this.fileSizeUnit * this.fileSizeUnit) {
        fileSize = parseFloat((fileSize / this.fileSizeUnit).toFixed(2));
      } else if (
        fileSize <
        this.fileSizeUnit * this.fileSizeUnit * this.fileSizeUnit
      ) {
        fileSize = parseFloat(
          (fileSize / this.fileSizeUnit / this.fileSizeUnit).toFixed(2)
        );
      }
    }

    return fileSize;
  }

  getFileSizeUnit = (fileSize: number) => {
    let fileSizeInWords = 'bytes';

    if (fileSize > 0) {
      if (fileSize < this.fileSizeUnit) {
        fileSizeInWords = 'bytes';
      } else if (fileSize < this.fileSizeUnit * this.fileSizeUnit) {
        fileSizeInWords = 'KB';
      } else if (
        fileSize <
        this.fileSizeUnit * this.fileSizeUnit * this.fileSizeUnit
      ) {
        fileSizeInWords = 'MB';
      }
    }

    return fileSizeInWords;
  }

  startUpload = (file: File): Promise<any> => {
    return this.systemService.lragfiles('start', {
      name: file.name      
    }).then((value: any) => {
      console.log(value);
    })
  }

  completedUpload = (file: File): Promise<any> => {
    return this.systemService.lragfiles('end', {
      name: file.name
    }).then((value: any) => {
      console.log(value);
    })
  }

  uploadChunk = (file: File, chunk: Buffer): Promise<any> => {
    return this.systemService.lragfiles('chunk', {
      name: file.name,
      chunk: Buffer.from(chunk)
    }).then((value: any) => {
      // console.log(value);
    })
  }

  noOfValidFiles = (): number => {
    return this.systemService.ragFiles.filter(v => v.status === 0).length;
  }

  areAllCSV = async (): Promise<boolean> => {
    const files: any = await this.ls();
    return files.length > 0 && files.filter((v: any) => v.name.toLowerCase().endsWith('.csv')).length === files.length;
  }

  getFiles = async (force: boolean): Promise<string[]> => {
    if (!this.loadedIndex) {
      this.loadedIndex = true;
      await this.loadIndex();
      this.docStatus = [];
    }
    if (this.files.length === 0 || force) {
      return this.systemService.lragfiles('ls', {}).then(async (names: string[]) => {
        for await (const name of names) {          
          const response: boolean = await this.systemService.commandIngest(
            'indexed', 
            { 
              localVector: this.systemService.localVector,
              source: name 
            }
          );
          if (this.docStatus && response === true) {
            const fIdx: number = this.docStatus.findIndex(f => f.name === name);
            if (fIdx > -1) {
              this.docStatus[fIdx].status = 0;
              this.docStatus[fIdx].text = 'indexed';
            } else {
              this.docStatus.push({
                name,
                status: 0,
                text: 'indexed'
              });               
            }            
          }                          
        }        
        this.files = names;
        return this.files;
      });
    } else {
      return Promise.resolve(this.files);
    }
  }

  loadIndex = async () => {
    const response: any = await this.systemService.commandIngest(
      'load', 
      { 
        localVector: this.systemService.localVector,
        collection: this.systemService.collection
      }
    );
    console.log('loadIndex:', response);
  }

  saveIndex = async () => {
    const response: any = await this.systemService.commandIngest(
      'save', 
      { 
        localVector: this.systemService.localVector,
        collection: this.systemService.collection
      }
    );
    console.log('saveIndex:', response);
  }

  ls = (force: boolean = false) : Promise<any[]> => {    
    return this.getFiles(force).then(async (names: string[]) => {
      const ocrRequired: string = await this.systemService.get('PAGES.INGEST.OCR_NEEDED');
      const unknown: string = await this.systemService.get('PAGES.INGEST.UNKNOWN');
      return names.map((v: string) => {
        if (this.docStatus) {
          return { 
            name: v,
            status: this.docStatus.findIndex(f => f.name === v) > -1 ? this.docStatus.find(f => f.name === v).status : 2,
            text: this.docStatus.findIndex(f => f.name === v) > -1 ? this.docStatus.find(f => f.name === v).text : ocrRequired
          }
        } else {
          return { 
            name: v,
            status: 2,
            text: unknown
          }
        }
      });      
    })
  }

  remove = (name: string): Promise<any> => {
    return this.systemService.lragfiles('rm', {
      name
    }).then((value: any) => {
      // console.log(value);
    })
  }

  cleanData = (): Promise<any> => {
    return this.systemService.lragfiles('cleanData', {}).then((value: any) => {
      // console.log(value);
    })
  }
}

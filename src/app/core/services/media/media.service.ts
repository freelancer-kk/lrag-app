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
  rootPath: string = '';

  constructor(
    private systemService: SystemService
  ) {
    this.systemService.lragfiles('rootpath', {}).then((value: string) => {
      this.rootPath = value;
    });
  }

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
      collection: this.systemService.collection,
      name: file.name   
    }).then((value: any) => {
      console.log(value);
    })
  }

  completedUpload = (file: File): Promise<any> => {
    return this.systemService.lragfiles('end', {
      collection: this.systemService.collection,
      name: file.name
    }).then((value: any) => {
      console.log(value);
    })
  }

  uploadChunk = (file: File, chunk: Buffer): Promise<any> => {
    return this.systemService.lragfiles('chunk', {
      collection: this.systemService.collection,
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
      this.docStatus = [];
      return this.systemService.lragfiles('ls', {
        collection: this.systemService.collection
      }).then(async (names: string[]) => {
        console.log('getFiles:names:', names);
        for await (const name of names) {          
          const response: boolean = await this.systemService.commandIngest(
            'indexed', 
            { 
              localVector: this.systemService.localVector,
              source: name 
            }
          );
          if (this.docStatus) {
            const fIdx: number = this.docStatus.findIndex(f => f.name === name);
            if (fIdx > -1) {
              this.docStatus[fIdx].status = response === true ? 0 : 1;
              this.docStatus[fIdx].text = response === true ? 'indexed' : 'Not indexed';
            } else {
              this.docStatus.push({
                name,
                status: response === true ? 0 : 1,
                text: response === true ? 'indexed' : 'Not indexed'
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

  basename = (fullpath: string): string => {    
    return this.systemService.basename(fullpath.replace(/\\/g,'/'));
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

  getCollections = (): Promise<any[]> => {
    return this.systemService.lragfiles('ls', {}).then((paths: string[]) => {
      if (paths) {
        return paths.map((value: string) => ({ 
          name: this.basename(value),
          value
        }))
      } else {
        return [];
      }
    });
  }

  createCollection = (collection: string): Promise<void> => {
    return this.systemService.lragfiles('mkdir', {
      collection
    });
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

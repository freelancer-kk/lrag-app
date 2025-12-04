import { Injectable } from '@angular/core';
import { SystemService } from '../system/system.service';
import { CommonService } from '../common-service';

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
  filesChecked: boolean[] = [];
  ocrRequiredStr: string | undefined;
  unknownStr: string | undefined;

  constructor(
    private systemService: SystemService,
    private commonService: CommonService,
  ) {
    this.systemService.lragfiles('rootpath', {}).then((value: string) => {
      this.rootPath = value;
    });
    this.commonService.get('PAGES.INGEST.OCR_NEEDED').then((value: string) => {
      this.ocrRequiredStr = value;
    })
    this.commonService.get('PAGES.INGEST.UNKNOWN').then((value: string) => {
      this.unknownStr = value;
    })
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
    });
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
    const files: any[] = [];
    await this.ls((entries: any[]) => { 
      entries.forEach((e: any) => {
        files.push(e);   
      })      
    }, true);
    return files.length > 0 && files.filter((v: any) => v && v.name && v.name.toLowerCase().endsWith('.csv')).length === files.length;
  }

  getFiles = async (cb: (entries: any[]) => void, force: boolean): Promise<string[]> => {
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
        // console.log('getFiles:names:', names);
        if (names && names.length > 0) {
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
                this.docStatus[fIdx].text = response === true ? 'embedded' : 'Not embedded';
                // console.log('getFiles:status:', this.docStatus[fIdx]);
              } else {
                this.docStatus.push({
                  name,
                  status: response === true ? 0 : 1,
                  text: response === true ? 'embedded' : 'Not embedded'
                });
                // console.log('getFiles:status:new:', this.docStatus[this.docStatus.length - 1]);
              }
            }
            cb([this.getStatusFromFile(name)]);
          }        
          this.files = names;
          return this.files;
        } else {
          return [];
        }
      });
    } else {
      cb(this.files.map((v: string) => {
        return this.getStatusFromFile(v);        
      }));
      return Promise.resolve(this.files);
    }
  }

  basename = (fullpath: string): string => {    
    return this.commonService.basename(fullpath.replace(/\\/g,'/'));
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

  deleteIndex = async () => {
    const response: any = await this.systemService.commandIngest(
      'delete', 
      { 
        localVector: this.systemService.localVector,
        collection: this.systemService.collection
      }
    );
    console.log('saveIndex:', response);
  }

  getCollections = (): Promise<any[]> => {
    return this.systemService.lragfiles('ls', {
      dirOnly: true
    }).then((paths: string[]) => {
      // console.log('getCollections:', paths);
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

  getStatusFromFile = (v: string): any => {
    if (this.docStatus) {
      const statusEntry: any = this.docStatus.find(f => f.name === v);
      if (statusEntry) {
        return { 
          name: v,
          status: statusEntry.status > 1 ? (this.systemService.localVector ? 1 : 2) : statusEntry.status,
          text: statusEntry.text ? statusEntry.text : this.ocrRequiredStr
        }
      } else {
        return { 
          name: v,
          status: 0,
          text: v.toLowerCase().endsWith('.pdf') ? this.ocrRequiredStr : ''
        }
      }
    } else {
      return { 
        name: v,
        status: 3,
        text: this.unknownStr
      }          
    }
  }

  ls = (cb: (entries: any[]) => void, force: boolean = false) : Promise<any[]> => {    
    return this.getFiles(cb, force).then(async (names: string[]) => {
      if (names.length > 0) {
        this.filesChecked = [...Array(names.length - 1).fill(false)];
      }
      const theFiles: any[] = names.map((n: string) => this.getStatusFromFile(n));
      return theFiles;
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

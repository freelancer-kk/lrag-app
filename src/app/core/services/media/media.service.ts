import { Injectable } from '@angular/core';
import { SystemService } from '../system/system.service';
import { isDefined } from '@ngx-translate/core';

@Injectable({
  providedIn: 'root'
})
export class MediaService {
  fileSizeUnit: number = 1024;
  public isApiSetup = false;
  docStatus: any[] | undefined = undefined;

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

  ls = () : Promise<any[]> => {
    return this.systemService.lragfiles('ls', {}).then(async (names: string[]) => {
      const failed: string = await this.systemService.get('PAGES.INGEST.OCR_NEEDED');
      const unknown: string = await this.systemService.get('PAGES.INGEST.UNKNOWN');
      return names.map((v: string) => {
        if (this.docStatus) {
          return { 
            name: v,
            status: this.docStatus.findIndex(f => f.name === v) > -1 ? this.docStatus.find(f => f.name === v).status : 1,
            text: this.docStatus.findIndex(f => f.name === v) > -1 ? this.docStatus.find(f => f.name === v).text : failed
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

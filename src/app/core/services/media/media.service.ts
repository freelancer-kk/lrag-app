import { Injectable } from '@angular/core';
import { SystemService } from '../system/system.service';

@Injectable({
  providedIn: 'root'
})
export class MediaService {
  fileSizeUnit: number = 1024;
  public isApiSetup = false;

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

  ls = () : Promise<any[]> => {
    return this.systemService.lragfiles('ls', {});
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

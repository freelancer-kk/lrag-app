import { Injectable } from '@angular/core';
import { CommonService, LStatus } from './common-service';
import { EStatus } from '../../shared/model';
import { Document } from "@langchain/core/documents";

@Injectable({
  providedIn: 'root'
})
export class RerankerService {
  serviceName: string = 'reranker';
  status: LStatus = new LStatus(EStatus.not_running);
  servicePID: number = -1;

  constructor(
    private commonService: CommonService
  ) {}

  findProcess = async () => {
    const response: any = await this.commonService.findProcess(this.serviceName);
    console.log('findProcess:', response);
    this.servicePID = response.servicePID;
  }

  start = async (): Promise<any> => {
    await this.findProcess();
    if (this.servicePID === -1) {
      return this.commonService.commandService(
        91,
        this.serviceName,
        'start',
        {}
      );
    }
  }

  startIfNecessary = async () => {
    await this.start();
    this.checkIfReady();        
    /*
    let cnt: number = 0;
    const tt = setInterval(async () => {
      const { installed } = await this.commonService.commandService(
        91,
        this.serviceName,
        'installed',
        {}
      );
      if (installed === true) {
        clearInterval(tt);
        await this.start();
        this.checkIfReady();        
      } else {
        cnt++
        if (cnt>50) {
          clearInterval(tt);
          this.status.update(EStatus.dead);
        }
      }
    }, 2000);
    */
  }

  checkIfReady = () => {
    let cnt: number = 0;
    const tt = setInterval(async () => {
      if ((await this.isReady()) === true) {
        clearInterval(tt);
        this.findProcess();
        this.status.update(EStatus.running);
      } else {
        cnt++
        if (cnt>50) {
          clearInterval(tt);
          this.status.update(EStatus.dead);
        }
      }
    }, 2000);
  }

  rerank = (query: string, docs: Document[]): Promise<any> => {
    return this.commonService.commandService(
      91,
      this.serviceName,
      'rerank', 
      { 
        query,
        docs
      }
    );    
  }

  isReady = async (): Promise<boolean> => {
    const { isReady } = await this.commonService.commandService(91, this.serviceName, 'isReady');
    if (!isReady) {
      this.status.update(EStatus.not_running);            
    } else {
      this.status.update(EStatus.running);
    }
    return isReady;
  }
}

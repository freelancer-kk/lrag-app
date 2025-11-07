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

  restartWhenGone = () => {
    let cnt: number = 0;
    const tt = setInterval(async () => {
      await this.findProcess();
      if (this.servicePID === -1) {
        clearInterval(tt);        
        this.startIfNecessary();
      } else {
        cnt++
        if (cnt>50) {
          clearInterval(tt);
          this.status.update(EStatus.dead);
        }
      }
    }, 2000);    
  }

  stop = (): Promise<any> => {
    this.status.update(EStatus.destroy);
    return this.commonService.commandService(
      291,
      this.serviceName,
      'stop',
      {
        mode: 1
      }
    );
  }

  restart = async (ev: any) => {
    await this.stop();    
  }

  startIfNecessary = async () => {
    this.status.update(EStatus.starting);
    await this.start();
    this.checkIfReady();   
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
    return isReady;
  }
}

import { Injectable, inject } from '@angular/core';
import { BridgeService } from './bridge/bridge.service';
import { TranslateService } from '@ngx-translate/core';
import path from 'path';
import { EStatus, IStatus } from '../../shared/model';
import { signal } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class CommonService {
  private translate = inject(TranslateService)

  constructor(
    private bridgeService: BridgeService,
  ) {}
      
  get = (key: string): Promise<string> => {
    return new Promise((resolve, reject) => {
      this.translate.get(key)
        .subscribe((res: string) => {
            resolve(res);
        });
    })
  }
  
  getEnvValue = (key: string, callbackId: number = 80) : Promise<string> => {
    return new Promise((resolve, reject) => {
      this.bridgeService.env(callbackId, 'get', { key }, async (data: any) => {
        resolve(data);        
      });
    })
  }

  basename = (fullpath: string): string => {    
    return path.basename(fullpath.replace(/\\/g,'/'));
  }

  setEnvValue = (key: string, value: string): Promise<string> => {
    return new Promise((resolve, reject) => {
      this.bridgeService.env(82, 'set', {
        key,
        value
      }, async (data: any) => {
        resolve(data);        
      });
    })
  }

  writeEnv = (): Promise<string> => {
    return new Promise((resolve, reject) => {
      this.bridgeService.env(81, 'write', {}, async (data: any) => {
        resolve(data);        
      });
    })
  }

  findProcess = (serviceName: string): Promise<any> => {
    return new Promise((resolve, reject) => { 
      this.bridgeService.service(91, serviceName, 'find', {}, async (data: any) => {        
        resolve(data);
      });
    });
  }
  
  commandService = (id = 90, serviceName: string, command: string, options: any = {}): Promise<any> => {
    return new Promise((resolve, reject) => { 
      this.bridgeService.service(id, serviceName, command, options, async (data: any) => {
        console.log('service command response:', command, options, data);
        resolve(data);
      });
    });
  }

  openExternal = (url: string): Promise<void> => {
    return new Promise((resolve, reject) => {
      this.bridgeService.openExternal(6, url, async () => {
        resolve();      
      });
    })    
  }  
}

const EStatusMap: { [key in EStatus]: string } = {
  [EStatus.uploading]: 'Uploading',
  [EStatus.uploaded]: 'Uploaded',
  [EStatus.loaded]: 'Loaded',
  [EStatus.loading]: 'Loading',
  [EStatus.indexing]: 'Indexing',
  [EStatus.splitting]: 'Splitting',
  [EStatus.extracting]: 'Extracting',
  [EStatus.saving]: 'Saving',
  [EStatus.adding]: 'Adding',
  [EStatus.thinking]: 'Thinking',
  [EStatus.reranking]: 'ReRanking',
  [EStatus.configuring]: 'Configuring',
  [EStatus.running_healthy]: 'Running Healthy',
  [EStatus.running]: 'Running',
  [EStatus.created]: 'Created',
  [EStatus.unpause]: 'Unpause',
  [EStatus.start]: 'Start',
  [EStatus.starting]: 'Starting',
  [EStatus.restarting]: 'ReStarting',
  [EStatus.preparing]: 'Preparing',
  [EStatus.error]: 'Error',
  [EStatus.destroy]: 'Destroy',
  [EStatus.die]: 'Die',
  [EStatus.running_unhealthy]: 'Running Unhealthy',
  [EStatus.exited]: 'Exited',
  [EStatus.pause]: 'Pause',
  [EStatus.paused]: 'Paused',
  [EStatus.downloading]: 'Downloading',
  [EStatus.health_status_healthy]: 'Health status healthy',
  [EStatus.dead]: 'Dead',
  [EStatus.not_running]: 'Not Running',
  [EStatus.unknown]: 'Unknown',
  [EStatus.warning]: 'Warning',
  [EStatus.downloaded]: 'Downloaded',
  [EStatus.not_installed]: 'Not installed',
  [EStatus.upgrade]: 'Upgrade',
  [EStatus.installed]: 'Installed'
};

export class LStatus {
  internalStatus = signal<IStatus>({status: EStatus.not_running, value: 0});

  constructor(estatus: EStatus, value: any = {}) {
    this.internalStatus = signal<IStatus>({
      status: estatus,
      value
    });
  }

  update = (status: EStatus, value: any = {}) => {
    this.internalStatus.update(() => ({status, value}))
  }

  get = (): EStatus => {
    return this.internalStatus().status;
  }

  getS = (): string => {
    const firstPart: string = EStatusMap[this.internalStatus().status];
    const value: any  = this.internalStatus().value;
    if (value && value.percentage) {
      return firstPart + ' (' + value.percentage + '%)'
    } else if (value && value.part && value.total) {
      return firstPart + ' (' + value.part + ' of ' + value.total + ')'
    }
    return firstPart;
  }

  getV = (): EStatus => {
    return this.internalStatus().value;
  }

  getSV = (): IStatus => {
    return this.internalStatus();
  }

  getC = (): string => {
    return this.getClassFromStatus(this.internalStatus().status);
  }

  getI = (): string => {
    return this.getIconFromStatus(this.internalStatus().status);
  }

  getClassFromStatus = (status: EStatus): string => {
    if (
      status === EStatus.running ||
      status === EStatus.configuring ||
      status === EStatus.extracting ||
      status === EStatus.reranking ||
      status === EStatus.thinking ||
      status === EStatus.uploading ||
      status === EStatus.splitting || 
      status === EStatus.uploaded ||
      status === EStatus.loading ||
      status === EStatus.loaded ||
      status === EStatus.indexing ||
      status === EStatus.saving ||
      status === EStatus.adding ||
      status === EStatus.running_healthy ||
      status === EStatus.health_status_healthy ||
      status === EStatus.exited)
    {
      return 'chip-success';
    } else if (
      status === EStatus.downloading ||
      status === EStatus.starting ||
      status === EStatus.running_unhealthy
    ) {
      return 'chip-warning';
    } else if (
      status === EStatus.die ||
      status === EStatus.error ||
      status === EStatus.destroy
     ) {
      return 'chip-error';
    } else {
      return 'chip';
    }
  }

  getIconFromStatus = (status: EStatus) => {
    switch (status) {
      case EStatus.uploading:
      case EStatus.uploaded:
      case EStatus.loaded:
      case EStatus.loading:
      case EStatus.indexing:
      case EStatus.splitting:
      case EStatus.extracting:
      case EStatus.saving:        
      case EStatus.adding:
      case EStatus.thinking:
      case EStatus.reranking:
      case EStatus.configuring:
      case EStatus.running_healthy: 
      case EStatus.running: {
        return 'directions_run';
      }
      case EStatus.created: {
        return 'create';
      }
      case EStatus.unpause:
      case EStatus.start:
      case EStatus.starting: {
        return 'start';
      }
      case EStatus.restarting: {
        return 'restart_alt';
      }
      case EStatus.error:
      case EStatus.destroy:
      case EStatus.die:
      case EStatus.running_unhealthy:
      case EStatus.exited: {
        return 'exit_to_app';
      }
      case EStatus.pause:
      case EStatus.paused: {
        return 'pause';
      }
      case EStatus.downloading: {
        return 'file_download';
      }
      case EStatus.health_status_healthy: {
        return 'health_and_safety';
      }
      case EStatus.dead: {
        return 'block';
      }
      default:
      case EStatus.not_running: {
        return 'question_mark';
      }    
    }
  }  
}


import { Injectable } from '@angular/core';
import { CommonService, LStatus } from './common-service';
import { EStatus } from '../../shared/model';

@Injectable({
  providedIn: 'root'
})
export class WatcherService {
  serviceName: string = 'watcher';
  status: LStatus = new LStatus(EStatus.not_running);
  servicePID: number = -1;
  brewStatus: LStatus = new LStatus(EStatus.unknown);
  ghostscriptStatus: LStatus = new LStatus(EStatus.unknown);
  url: string = '';
  brew: string = '';

  constructor(
    private commonService: CommonService
  ) {}

  findProcess = async () => {
    const response: any = await this.commonService.findProcess(this.serviceName, 97);
    console.log('findProcess:watcher:', response);
    this.servicePID = response.servicePID;
  }

  start = (): Promise<any> => {
    return this.commonService.commandService(
      92,
      this.serviceName,
      'start',
      {}
    );
  }

  startIfNecessary = () => {
    let cnt: number = 0;
    const tt = setInterval(async () => {
      const { installed } = await this.commonService.commandService(
        92,
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
  }

  checkIfReady = () => {
    let cnt: number = 0;
    const tt = setInterval(async () => {
      if ((await this.isReady()) === true) {
        clearInterval(tt);
        this.status.update(EStatus.running);
        await this.findProcess();        
      } else {
        cnt++
        if (cnt>50) {
          clearInterval(tt);
          this.status.update(EStatus.dead);
        }
      }
    }, 2000);
  }

  isReady = async (): Promise<boolean> => {
    const { isReady } = await this.commonService.commandService(92, this.serviceName, 'isReady');
    if (!isReady) {
      this.status.update(EStatus.not_running);            
    } else {
      this.status.update(EStatus.running);
    }
    return isReady;
  }

  installUpgradeBrew = async (ev: any) => {
    this.commonService.openExternal(
      this.url,
      {
        serviceName: 'watcher'
      }
    );
  }

  installUpgradeGS = async (ev: any) => {
      const command: string = this.brewStatus.get() === EStatus.upgrade_brew ? 'upgrade' : 'install'
      this.ghostscriptStatus.update(command === 'install' ? EStatus.installing_brew : EStatus.upgrading_brew);      
      const response: any = await this.commonService.commandService(
        92, 
        this.serviceName,
        'brew',
        {
          args: [
            command,
            this.brew
          ]
        }
      );
      console.log('gs:install/upgrade:', response); 
  }
}

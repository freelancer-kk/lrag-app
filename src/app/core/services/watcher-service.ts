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
  depNotInstalledTimer: any;

  constructor(
    private commonService: CommonService
  ) {}

  findProcess = async () => {
    this.clearTimer();
    const response: any = await this.commonService.findProcess(this.serviceName, 97);
    console.log('findProcess:watcher:', response);
    this.servicePID = response.servicePID;
  }

  start = async (): Promise<any> => {
    await this.findProcess();
    if (this.servicePID === -1) {
      return this.commonService.commandService(
        92,
        this.serviceName,
        'start',
        {}
      );
    }
  }

  clearTimer = () => {
    if (this.depNotInstalledTimer) {
      clearTimeout(this.depNotInstalledTimer);
      this.depNotInstalledTimer = undefined;
    }
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
    if (this.ghostscriptStatus.get() === EStatus.upgrade_brew || this.ghostscriptStatus.get() === EStatus.installed_brew) {
      const command: string = this.ghostscriptStatus.get() === EStatus.upgrade_brew ? 'upgrade' : 'install'
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
      console.log('gs:install/upgrade:brew:', response); 
    } else {
      this.commonService.openExternal(
        this.url,
        {
          serviceName: 'watcher'
        }
      );
      console.log('gs:install/upgrade:url'); 
    }
  }
}

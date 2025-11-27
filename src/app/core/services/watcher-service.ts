import { Injectable } from '@angular/core';
import { CommonService, LStatus } from './common-service';
import { EStatus } from '../../shared/model';

@Injectable({
  providedIn: 'root'
})
export class WatcherService {
  serviceName: string = 'watcher';
  status: LStatus = new LStatus(EStatus.running);
  servicePID: number = -1;
  brewStatus: LStatus = new LStatus(EStatus.unknown);
  wingetStatus: LStatus = new LStatus(EStatus.unknown);
  ghostscriptStatus: LStatus = new LStatus(EStatus.unknown);
  turl: string = '';
  gurl: string = '';
  burl: string = '';
  brew: string = '';
  winget: string = '';
  shellCommands: string[] = [];
  depNotInstalledTimer: any;
  tt: any;
  useWatcher: boolean = false;

  constructor(
    private commonService: CommonService
  ) {}

  findProcess = async () => {
    this.clearTimer();
    const response: any = await this.commonService.findProcess(this.serviceName, 97);
    console.log('findProcess:watcher:', response);
    this.servicePID = response.servicePID;
  }

  start = async (): Promise<boolean> => {
    await this.findProcess();
    if (this.servicePID === -1) {
      await this.commonService.commandService(
        92,
        this.serviceName,
        'start',
        {}
      );
      return true;
    } else {
      // Already running therefore no check
      return false;
    }
  }

  clearTimer = () => {
    if (this.depNotInstalledTimer) {
      clearTimeout(this.depNotInstalledTimer);
      this.depNotInstalledTimer = undefined;
    }
  }

  clearTT = () => {
    if (this.tt) {
      clearInterval(this.tt);
      this.tt = undefined;
    }
  }

  startIfNecessary = async () => {
    this.status.update(EStatus.starting);
    if (await this.start()) {
      this.checkIfReady();   
    } else {
      await this.restart(undefined);
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
      292,
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

  checkIfReady = () => {
    let cnt: number = 0;
    this.tt = setInterval(async () => {
      if ((await this.isReady()) === true) {
        clearInterval(this.tt);
        this.status.update(EStatus.running);
        await this.findProcess();        
      } else {
        cnt++
        if (cnt>50) {
          clearInterval(this.tt);
          this.status.update(EStatus.dead);
        }
      }
    }, 2000);
  }

  isReady = async (): Promise<boolean> => {
    const { isReady } = await this.commonService.commandService(592, this.serviceName, 'isReady');
    return isReady;
  }

  runShellCommand = (commandIdx: number): Promise<boolean> => {
    if (commandIdx > this.shellCommands.length) {
      return Promise.resolve(false);
    } else {
      return this.commonService.commandService(
        692, 
        this.serviceName,
        'shell',
        {
          args: this.shellCommands[commandIdx].split(' '),
          commandIdx,
        }
      ).then(() => {
        return true;
      })
    }
  }

  installUpgradeBrew = async (ev: any) => {
    if (this.shellCommands.length > 0) {
      console.log('install/upgrade:brew:', this.shellCommands);    
      this.brewStatus.update(EStatus.installing);
      const response: any = await this.runShellCommand(0);
      console.log('shell:install/upgrade:brew:', response);
    } else {
      this.commonService.openExternal(
        this.burl,
        {
          serviceName: 'watcher',
          installType: 'brew'
        }
      );
    }
  }

  installUpgradeGS = async (ev: any) => {
    /*
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
    */
      this.commonService.openExternal(
        this.gurl,        
        {          
          serviceName: 'watcher',
          installType: 'ghostscript'
        }
      );
      console.log('gs:install/upgrade:url'); 
//    }
  }

  installUpgradeTesseract = async (ev: any) => {
      // const command: string = this.wingetStatus.get() === EStatus.upgrade_winget ? 'upgrade' : 'install'
      // this.wingetStatus.update(command === 'install' ? EStatus.installing_winget : EStatus.upgrading_winget)
      this.commonService.openExternal(
        this.turl,        
        {          
          serviceName: 'watcher',
          installType: 'tesseract'
        }
      );
      /*
      const response: any = await this.commonService.commandService(
        92, 
        this.serviceName,
        'winget',
        {
          args: [
            command,
            this.winget
          ]
        }
      );
      */
      console.log('tesseract:install/upgrade:winget:');     
  }
}

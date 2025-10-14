import { Component, ViewChild, OnInit, NgZone, effect, inject } from '@angular/core';
import { ElectronService } from './core/services';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { APP_CONFIG } from '../environments/environment';
import { RouterOutlet } from '@angular/router';
import { BridgeService } from './core/services/bridge/bridge.service';
import { MatSidenav, MatSidenavModule } from '@angular/material/sidenav';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatMenuModule } from '@angular/material/menu';
import { Router, RouterLink } from '@angular/router';
import { SystemService } from './core/services/system/system.service';
import {MatSlideToggleModule} from '@angular/material/slide-toggle';
import {MatTooltipModule} from '@angular/material/tooltip';
import {MatProgressSpinnerModule} from '@angular/material/progress-spinner';
import { MediaService } from './core/services/media/media.service';
import {MatSnackBar} from '@angular/material/snack-bar';
import { AlertComponent } from './alert.component/alert.component';
import { MatDialog } from '@angular/material/dialog';

@Component({
    selector: 'app-root',
    templateUrl: './app.component.html',
    styleUrls: ['./app.component.scss'],
    standalone: true,
    imports: [
      RouterLink,
      TranslateModule,
      MatToolbarModule,
      MatSidenavModule,
      MatIconModule,
      MatListModule,
      MatMenuModule,
      RouterOutlet,
      MatSlideToggleModule,
      MatTooltipModule,
      MatProgressSpinnerModule,
      MatButtonModule      
    ]    
})
export class AppComponent implements OnInit {
  private _snackBar = inject(MatSnackBar);
  readonly dialog = inject(MatDialog);
  @ViewChild('sidenav', {static: true}) sidenav!: MatSidenav;
  isExpanded: boolean = true;
  dockerConnectInterval: any;
  firstTime: boolean = true;
  serviceTimer: any;

  constructor(
    private electronService: ElectronService,
    private translate: TranslateService,
    private bridgeService: BridgeService,
    private router: Router,
    public systemService: SystemService,
    private ngZone: NgZone,
    private mediaService: MediaService
  ) {
    console.log('APP_CONFIG', APP_CONFIG);

    document.body.setAttribute(
      'data-theme',
      this.systemService.dark ? 'dark' : 'light'
    );
    if (electronService.isElectron) {
      console.log(process.env);
      console.log('Running in electron');
      console.log('Electron ipcRenderer', this.electronService.ipcRenderer);
      console.log('NodeJS childProcess', this.electronService.childProcess);      
      this.router.navigate(['home']);
    } else {
      console.log('Running in browser');
    }
    this.bridgeService.registerListener();
    this.bridgeService.eventCallback((ev: any, eventObj: any) => {
      try {          
        const { type, data } = eventObj;
        // console.log('type', type, 'data', data);        
        switch(type) {
          case 'ollama-gpu-accel-started': {
            this.ngZone.run(() => {
              this.systemService.gpuChangeStatus.update(() => 'running');
              this.systemService.modelStatus.update(() => 'configuring');
            })
          }
          break;
          case 'ollama-gpu-accel-done': {
            this.ngZone.run(() => {
              this.forceExit(undefined);
            })
          }
          break;
          case 'ollama-extract-starting': {
            this.ngZone.run(async () => {
              this._snackBar.open(
                await this.systemService.get('APP.OLLAMA_DOWNLOADING'),
                await this.systemService.get('OK'), {
                  duration: 20000,
                }
              );              
              this.systemService.ollamaStatus.update(() => `preparing`);
            })
          }
          break;
          case 'ollama-download': {
            this.ngZone.run(() => {
              this.systemService.ollamaStatus.update(() => `downloading ${data.percentage}%`);              
            })
          }
          break;
          case 'ollama-extract-extract': {
            this.ngZone.run(() => {
              this.systemService.ollamaStatus.update(() => `extracting`);
            })
          }
          break;
          case 'ollama-extract-done': {
            this.ngZone.run(() => {
              this.startServicesIfNecessary();
            })
          }
          case 'ollama-ready': {
            this.ngZone.run(() => {
              this.systemService.ollamaStatus.update(() => 'running');
            })
          }
          break;
          case 'ollama-pull-start': {
            this.ngZone.run(() => {
              this.systemService.modelStatus.update(() => `downloading 0%`);
            })
          }
          break;
          case 'ollama-pull-progress': {
            this.ngZone.run(() => {
              this.systemService.modelStatus.update(() => `downloading ${data.percent}%`);              
            })            
          }
          break;          
          case 'ollama-pull-complete': {
            this.ngZone.run(() => {
              this.systemService.modelStatus.update(() => `finalising...`);              
            })            
          }
          break;
          case 'ollama-pull-part': {
            this.ngZone.run(() => {              
              this.systemService.modelStatus.update(() => `${data.partStatus}`);              
            })            
          }
          break;
          case 'ollama-pull-done': {
            this.ngZone.run(() => {
              this.systemService.modelStatus.update(() => 'running');
              this.systemService.getAvailableLLMs();
            })            
          }
          break;
          case 'langchain-run-doc': {
            this.ngZone.run(() => {
              if (this.mediaService.docStatus) {
                if (this.mediaService.docStatus.findIndex(f => f.name === data.source) === -1) {
                  this.mediaService.docStatus.push({
                    name: data.source,
                    status: 0,
                    text: ''
                  });
                  console.log('doc statuses:', this.mediaService.docStatus);
                }
              }
            })            
          }
          break;
          case 'langchain-run-start': {
            this.ngZone.run(() => {
              this.systemService.ingestStatus.update(() => 'running');
            })            
          }
          break;
          case 'langchain-run-loaded': {
            this.ngZone.run(() => {
              this.systemService.ingestStatus.update(() => 'loaded');
            })            
          }
          break;
          case 'langchain-run-splitting': {
            this.ngZone.run(() => {
              this.systemService.ingestStatus.update(() => 'splitting');
            })            
          }
          break;
          case 'langchain-run-indexing': {
            this.ngZone.run(() => {
              this.systemService.ingestStatus.update(() => 'indexing');
            })            
          }
          break;
          case 'langchain-run-add-chunk': {
            this.ngZone.run(() => {
              this.systemService.ingestStatus.update(() => 'indexing ' + data.chunk + ' of ' + data.total);
            })            
          }
          break;
          case 'langchain-run-split-chunk': {
            this.ngZone.run(() => {
              this.systemService.ingestStatus.update(() => 'splitting ' + data.chunk + ' of ' + data.total);
            })            
          }
          break;
          case 'langchain-run-saving': {
            this.ngZone.run(() => {
              this.systemService.ingestStatus.update(() => 'saving');
            })            
          }
          break;
          case 'langchain-run-adding'  : {
            this.ngZone.run(() => {
              this.systemService.ingestStatus.update(() => 'adding');
            })            
          }
          break;
          case 'langchain-run-complete'  : {
            this.ngZone.run(() => {
              this.systemService.ingestStatus.update(() => 'not running');
            })            
          }
          break;
          case 'langchain-run-error'  : {
            this.ngZone.run(() => {
              this.systemService.ingestStatus.update(() => 'error');
            })            
          }
          break;
          case 'langchain-run-warning'  : {
            this.ngZone.run(() => {
              this.systemService.ingestStatus.update(() => 'warning');
            })            
          }
          break;
        } 
      } catch (e) {
        console.error(e);
      }
    })

    effect(() => {
      this.systemService.ollamaStatus();
      this.systemService.modelStatus();
      this.systemService.ingestStatus();
      this.systemService.gpuChangeStatus();
      this.systemService.calcOverallStatus();
      // console.log('overall status:', this.systemService.overallStatus());
      if (this.systemService.overallStatus() === "running: unhealthy") {
        if (this.firstTime && (this.systemService.ollamaStatus() === "running")) {
          this.findOllamaProcess();
          this.pullModelsIfNecessary();
        }
      }
      if (this.systemService.overallStatus() === "running: healthy") {
        systemService.showGetOllama = false;        
        if (systemService.ollamaPID === -1) {
          this.findOllamaProcess();
        }
        this.navigateAway();
      }
    })
  }

  navigateAway = async () => {
    await this.mediaService.ls();
    if (this.mediaService.noOfValidFiles() > 0) {
      this.router.navigate(['insights']);
    } else {
      this.router.navigate(['ingest']);
    }
  }

  findOllamaProcess = async () => {
    const response: any = await this.systemService.findProcesses();
    console.log('findProcess:', response);
    this.systemService.ollamaPID = response.ollamaPID;
  }

  switchTheme = (event: any) => {
    this.systemService.dark = !this.systemService.dark;    
    document.body.setAttribute(
      'data-theme',
      this.systemService.dark ? 'dark' : 'light'
    );
    localStorage.setItem('theme', JSON.stringify(this.systemService.dark));
  }

  async ngOnInit() {    
    this.systemService.osType = await this.systemService.getOSType();
    if (this.systemService.osType && (this.systemService.osType.isMac === true)) { 
      this.systemService.manageOllamaExternally = true; 
    };
    console.log('osType:', this.systemService.osType, this.systemService.manageOllamaExternally);
    this.systemService.cpu = await this.systemService.getCpu();
    this.systemService.gpu = await this.systemService.getGpu();
    this.systemService.mem = await this.systemService.getTotalMemory();
    this.systemService.disks = await this.systemService.getDisks();
    setTimeout(() => {
      this.startServicesIfNecessary();  
    }, 400)   
  }

  rotate = (event: any) => {
    if (this.isExpanded) {
      event.srcElement.classList.remove("rotate0");
      this.isExpanded = false;
      event.srcElement.classList.add("rotate180");
    } else {
      event.srcElement.classList.remove("rotate180");
      this.isExpanded = true;
      event.srcElement.classList.add("rotate0");
    }
  }

  startServicesIfNecessary = async () => {    
    // Check if ollama is running
    console.log('startServicesIfNecessary:');
    const { isReady } = await this.systemService.commandOllama('isRunning');
    console.log('ollama check RUNNING:', isReady, this.systemService.manageOllamaExternally);
    if (isReady === true) {
      if (this.systemService.manageOllamaExternally === true) {
        this.setOllamaCheckTimer();
      }
      this.systemService.ollamaStatus.update(() => 'running');      
    } else {
      if (this.systemService.manageOllamaExternally === true) {
        console.log('SHOWING OLLAMA MANAUAL WARNING:', this.systemService.manageOllamaExternally);
        const snackBarRef = this._snackBar.open(
          await this.systemService.get('APP.OLLAMA_NOT_RUNNING'), 
          await this.systemService.get('OK')
        );
        snackBarRef.afterDismissed().subscribe(() => {
          this.systemService.showGetOllama = true;
        });
        this.setOllamaCheckTimer();
      } else {
        const response = await this.systemService.commandOllama(
          'start',
          {
            gpuAccel: this.systemService.gpuAcceleration
          }
        );
        if (response.status === 'error' && response.error === 'extraction') {
          this.systemService.ollamaStatus.update(() => 'extracting');
          console.log('waiting for extraction to complete, then start...');
        } else {
          this.systemService.ollamaStatus.update(() => 'running');
        }
      }
    }
  }   

  setOllamaCheckTimer = () => {
    if (this.serviceTimer) {
      clearInterval(this.serviceTimer);
    }
    this.serviceTimer = setInterval(async () => {
      const { isReady } = await this.systemService.commandOllama('isRunning');
      if (!isReady) {
        this.systemService.ollamaStatus.update(() => 'not running');            
      } else {
        this.systemService.ollamaStatus.update(() => 'running');
      }
    }, 10000);
  }

  pullModelsIfNecessary = async () => {
    try {
      if (this.systemService.selectedModel === '') {
        this.systemService.getEnvValue('LLM_MODEL_NAME').then((value: string) => {
          console.log('environment llm:', value);
          this.systemService.selectedModel = value;
          this.systemService.downloadedLLM = value;          
        })
      }
      console.log('pullModelsIfNecessary:getAvailableLLMs()');
      await this.systemService.getAvailableLLMs();
      if (this.systemService.availableModels.findIndex(f => f.name === this.systemService.embeddings) === -1) {
        this.systemService.modelStatus.update(() => 'downloading');
        console.log('pull:', this.systemService.embeddings);
        await this.systemService.commandOllama('pull', { model: this.systemService.embeddings, stream: true});
      }
      if (this.systemService.availableModels.findIndex(f => f.name === this.systemService.models[0].value) === -1) {
        this.systemService.modelStatus.update(() => 'downloading');
        console.log('pull:', this.systemService.models[0].value);
        await this.systemService.commandOllama('pull', { model: this.systemService.models[0].value, stream: true});
      }
      this.firstTime = false;
      this.systemService.modelStatus.update(() => 'running');      
    } catch (e) {
      console.error(e);
      if (this.firstTime) {
        setTimeout(() => {
          console.log('Trying again possibly ollama still starting ...');
          this.pullModelsIfNecessary();
        }, 7000)
      }
    }    
  }
  
  appExit = async (ev: any) => {
    const dialogRef = this.dialog.open(
      AlertComponent, {
        data: {
          type: 1,
          params: {
            message: await this.systemService.get('APP.EXIT_ARE_YOU_SURE')
          }
        }
      });
    dialogRef.afterClosed().subscribe(async (result) => {
      console.log(`Dialog result: ${result}`);
      if (result === true) {
        const result = await this.systemService.quitApp();
        console.log('app quit:', result);
      }
    });
  }

  forceExit = async (ev: any) => {
    console.log('forcing exit!');
    const dialogRef = this.dialog.open(
      AlertComponent, {
        data: {
          type: 2,
          params: {
            message: await this.systemService.get('GPU_CHANGE_RESTART')
          }
        }
      });
    dialogRef.afterClosed().subscribe(async () => {
      await this.systemService.quitApp();      
    });
  }
}

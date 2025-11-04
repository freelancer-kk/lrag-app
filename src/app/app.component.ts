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
import { CommonService } from './core/services/common-service';
import { OllamaService } from './core/services/ollama-service';
import { EStatus, IStatus } from './shared/model';
import { RerankerService } from './core/services/reranker-service';
import { WatcherService } from './core/services/watcher-service';

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

  EStatus: typeof EStatus = EStatus;

  isExpanded: boolean = true;
  dockerConnectInterval: any;
  firstTime: boolean = true;
  firstRun: boolean = true;

  ollamaStatus: IStatus | undefined;
  modelStatus: EStatus | undefined;
  ingestStatus: EStatus | undefined;
  gpuStatus: EStatus | undefined;
  overallStatus: EStatus | undefined;

  constructor(
    private electronService: ElectronService,
    private translate: TranslateService,
    private bridgeService: BridgeService,
    private router: Router,
    public commonService: CommonService,
    public systemService: SystemService,
    private ngZone: NgZone,
    private mediaService: MediaService,
    public ollamaService: OllamaService,
    public rerankerService: RerankerService,
    public watcherService: WatcherService
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
    this.bridgeService.ocrCallback((ev: any, eventObj: any) => {
      try {          
        const { type, data } = eventObj;
        console.log('type', type, 'data', data);        
        switch(type) {
          case 'ocr-processor-error': {
            this.ngZone.run(async () => {
              if (this.mediaService.docStatus) {
                const fIdx: number = this.mediaService.docStatus.findIndex(f => f.name === data.localfile);
                if (fIdx > -1) {
                  this.mediaService.docStatus[fIdx].status = 1;
                  this.mediaService.docStatus[fIdx].text = await this.commonService.get('PAGES.INGEST.OCR_ERROR');
                } else {
                  this.mediaService.docStatus.push({
                    name: data.localfile,
                    status: 1,
                    text: await this.commonService.get('PAGES.INGEST.OCR_ERROR')
                  });               
                }
                this.systemService.ragFiles = await this.mediaService.ls();
              }                            
            })            
          }
          break;
          case 'ocr-processor-put': {
            this.ngZone.run(async () => {
              if (this.mediaService.docStatus) {
                const fIdx: number = this.mediaService.docStatus.findIndex(f => f.name === data.localfile);
                if (fIdx > -1) {
                  this.mediaService.docStatus[fIdx].status = 2;
                  this.mediaService.docStatus[fIdx].text = await this.commonService.get('PAGES.INGEST.OCR_PREPARE');
                } else {
                  console.log('ocr-processor-put:', data.localfile);
                  this.mediaService.docStatus.push({
                    name: data.localfile,
                    status: 2,
                    text: await this.commonService.get('PAGES.INGEST.OCR_PREPARE')
                  });               
                }
                this.systemService.ragFiles = await this.mediaService.ls();
              }                            
            })
          }
          break;
          case 'ocr-processor-putted': {
            this.ngZone.run(async () => {
              if (this.mediaService.docStatus) {
                const fIdx: number = this.mediaService.docStatus.findIndex(f => f.name === data.localfile);
                if (fIdx > -1) {
                  this.mediaService.docStatus[fIdx].status = 2;
                  this.mediaService.docStatus[fIdx].text = await this.commonService.get('PAGES.INGEST.OCR_START');
                } else {
                  this.mediaService.docStatus.push({
                    name: data.localfile,
                    status: 2,
                    text: await this.commonService.get('PAGES.INGEST.OCR_START')
                  });               
                }
                this.systemService.ragFiles = await this.mediaService.ls();
              }                            
            })
          }
          break;
          case 'ocr-processor-complete': {
            this.ngZone.run(async () => {
              if (this.mediaService.docStatus) {
                const fIdx: number = this.mediaService.docStatus.findIndex(f => f.name === data.localfile);
                if (fIdx > -1) {
                  this.mediaService.docStatus[fIdx].status = 0;
                  this.mediaService.docStatus[fIdx].text = await this.commonService.get('PAGES.INGEST.OCR_DONE');
                } else {
                  this.mediaService.docStatus.push({
                    name: data.localfile,
                    status: 0,
                    text: await this.commonService.get('PAGES.INGEST.OCR_DONE')
                  });               
                }
                this.systemService.ragFiles = await this.mediaService.ls();
              }                            
            })
          }
          break;
        }
      } catch (e) {
        console.error(e);
      }
    })
    
    this.bridgeService.eventCallback((ev: any, eventObj: any) => {
      try {          
        const { type, data } = eventObj;
        // console.log('type', type, 'data', data);        
        // service-prereq-check-start
        // service-prereq-check-stdout
        // service-prereq-check-stderr
        // service-prereq-check-exit
        // service-prereq-check-notinstalled
        
        switch(type) {
          case 'after-link-opened': {
            if (data.serviceName === 'watcher') {
              if (data.installType === 'ghostscript') {
                this.watcherService.ghostscriptStatus.update(EStatus.installed)
              } else {
                this.watcherService.brewStatus.update(EStatus.installed)
              }
              this.forceExit('RESTART_INSTALL', true)
            }
          }
          break;
          case 'brew-running-exit':
            this.ngZone.run(() => {
              if (data.serviceName === 'watcher') {
                const { prereq, exitCode } = data;
                if (exitCode === '0') {
                  prereq === 'homebrew' ?
                    this.watcherService.brewStatus.update(EStatus.installed) :
                    this.watcherService.ghostscriptStatus.update(EStatus.installed)

                    // Application needs to be restarted
                    this.forceExit('RESTART', true)
                } else {
                  prereq === 'homebrew' ?
                    this.watcherService.brewStatus.update(EStatus.error) :
                    this.watcherService.ghostscriptStatus.update(EStatus.error)
                }
              } 
            })
          break;
          case 'winget-running-exit':
            this.ngZone.run(() => {
              if (data.serviceName === 'watcher') {
                const { exitCode } = data;
                if (exitCode === '0') {
                    this.watcherService.wingetStatus.update(EStatus.installed)
                    // Application needs to be restarted
                    this.forceExit('RESTART', true)
                } else {
                    this.watcherService.wingetStatus.update(EStatus.error)
                }
              } 
            })
          break;
          case 'service-prereq-check-stdout':
            this.ngZone.run(() => {
              const { serviceName, prereq, url, brew, winget, version, expectedVersion } = data;            
              if (serviceName === 'watcher') {
                console.log('service-prereq-check-std:', data);
                if (url) {
                  this.watcherService.url = url;             
                }
                if (brew) {                
                  this.watcherService.brew = brew;
                }
                if (winget) {
                  this.watcherService.winget = winget;
                }
                if (Number.parseInt(version) >= Number.parseInt(expectedVersion)) {
                  switch (prereq) {
                    case 'homebrew': {
                      this.watcherService.brewStatus.update(brew ? EStatus.installed : EStatus.installed)
                    }
                    break;
                    case 'tesseract': {
                      this.watcherService.wingetStatus.update(EStatus.installed)
                    }
                    break;
                    default: {
                      this.watcherService.ghostscriptStatus.update(brew ? EStatus.installed : EStatus.installed)
                    }
                  }                                    
                } else {
                  switch (prereq) {
                    case 'homebrew': {
                      this.watcherService.brewStatus.update(brew ? EStatus.upgrade_brew : EStatus.upgrade)
                    }
                    break;
                    case 'tesseract': {
                      this.watcherService.wingetStatus.update(EStatus.upgrade_winget);
                      this.watcherService.clearTT();
                    }
                    break;
                    default: {
                      this.watcherService.ghostscriptStatus.update(brew ? EStatus.upgrade_brew : EStatus.upgrade)
                    }
                  }                  
                }
              } 
            })
          break;
          case 'service-prereq-check-stderr':
            this.ngZone.run(() => {
              const { serviceName, prereq, url, brew, winget } = data;
              console.log('service-prereq-check-err:', data);
              if (serviceName === 'watcher') {
                if (url) {
                  this.watcherService.url = url;
                }
                if (brew) {                
                  this.watcherService.brew = brew;
                }
                if (winget) {
                  this.watcherService.winget = winget;
                }
                this.watcherService.depNotInstalledTimer = setTimeout(() => {
                  switch (prereq) {
                    case 'homebrew': {
                      this.watcherService.brewStatus.update(brew ? EStatus.installed_brew : EStatus.not_installed)
                    }
                    break;
                    case 'tesseract': {
                      this.watcherService.wingetStatus.update(EStatus.installed_winget);
                      this.watcherService.clearTT();
                    }
                    break;
                    default: {
                      this.watcherService.ghostscriptStatus.update(brew ? EStatus.installed_brew : EStatus.not_installed)
                    }
                  }                                    
                }, 10000);
              }
            })
          break;
          case 'service-download-complete': {
            this.ngZone.run(() => {
              if (data.serviceName === 'ollama') {
                this.ollamaService.status.update(EStatus.extracting);
              } else if (data.serviceName === 'reranker') {
                this.rerankerService.status.update(EStatus.extracting);
              } else if (data.serviceName === 'watcher') {
                this.watcherService.status.update(EStatus.extracting);
              }
            })
          }
          break;
          case 'service-download-part': {
            this.ngZone.run(() => {
              this.systemService.servicesDownloading = true;
              if (data.serviceName === 'ollama') {
                this.ollamaService.status.update(EStatus.downloading, { percentage: data.percentage });                
              } else if (data.serviceName === 'reranker') {
                this.rerankerService.status.update(EStatus.downloading, { percentage: data.percentage });                
              } else if (data.serviceName === 'watcher') {
                this.watcherService.status.update(EStatus.downloading, { percentage: data.percentage });                
              }
            })
          }
          break;
          case 'service-extract-download-starting': {
            this.ngZone.run(async () => {
              if (data.serviceName === 'ollama') {
                this._snackBar.open(
                  await this.commonService.get('APP.OLLAMA_DOWNLOADING'),
                  await this.commonService.get('OK'), {
                    duration: 20000,
                  }
                );              
                this.ollamaService.status.update(EStatus.preparing);
              } else if (data.serviceName === 'reranker') {
                this.rerankerService.status.update(EStatus.preparing);
              } else if (data.serviceName === 'watcher') {
                this.watcherService.status.update(EStatus.preparing);
              }
            })
          }
          break;
          case 'service-extract-extract-starting': {
            this.ngZone.run(async () => {
              if (data.serviceName === 'ollama') {
                this.ollamaService.status.update(EStatus.extracting);
              } else if (data.serviceName === 'reranker') {
                this.rerankerService.status.update(EStatus.extracting);
              } else if (data.serviceName === 'watcher') {
                this.watcherService.status.update(EStatus.extracting);
              }
            })
          }
          break;
          case 'service-extract-download-done': {
            this.ngZone.run(() => {
              if (data.serviceName === 'ollama') {
                this.ollamaService.status.update(EStatus.downloaded);
                if (data.checksPassed) {
                  this.ollamaService.startOnTimer(this.toastOllamaNotRunning);
                }
              } else if (data.serviceName === 'reranker') {
                this.rerankerService.status.update(EStatus.downloaded);
                if (data.checksPassed) {                
                  this.rerankerService.startIfNecessary();
                }                
              } else if (data.serviceName === 'watcher') {                
                this.watcherService.status.update(EStatus.downloaded);
                if (data.checksPassed) {                
                  this.watcherService.startIfNecessary();
                }
              }
            })
          }
          break;
          case 'service-installed-updated-done': {
            this.ngZone.run(() => {
              console.log('service:installed:starting:', data.serviceName);
              if (data.serviceName === 'ollama') {
                this.ollamaService.status.update(EStatus.installed);
                this.ollamaService.startOnTimer();
              } else if (data.serviceName === 'reranker') {
                this.rerankerService.status.update(EStatus.installed);
                this.rerankerService.startIfNecessary();                
              }  else if (data.serviceName === 'watcher') {
                this.watcherService.status.update(EStatus.installed);
                this.watcherService.startIfNecessary();                
              }
            })
          }
          break;
          case 'service-start': {

          }
          break;
          case 'service-ready-state': {
            this.ngZone.run(() => {
              if (data.serviceName === 'ollama' && (data.ready === true)) {
                this.ollamaService.status.update(EStatus.running);
              } else if (data.serviceName === 'reranker' && (data.ready === true)) {
                this.rerankerService.status.update(EStatus.running);
              } else if (data.serviceName === 'watcher' && (data.ready === true)) {
                this.watcherService.status.update(EStatus.running);
              }              
            })
          }
          break;
          case 'service-running-stdout': {

          }
          break;
          case 'service-running-stderr': {

          }
          break;
          case 'service-running-exit': {

          }
          break;
          case 'service-stop': {

          }
          break;
          case 'ollama-gpu-accel-started': {
            this.ngZone.run(() => {
              this.systemService.gpuChangeStatus.update(EStatus.running);
              this.systemService.modelStatus.update(EStatus.configuring);
            })
          }
          break;
          case 'ollama-gpu-accel-done': {
            this.ngZone.run(() => {
              this.forceExit();
            })
          }
          break;          
          case 'ollama-pull-start': {
            this.ngZone.run(() => {
              this.systemService.modelStatus.update(EStatus.downloading, 0);
            })
          }
          break;
          case 'ollama-pull-progress': {
            this.ngZone.run(() => {
              this.systemService.modelStatus.update(EStatus.downloading, { percentage: data.percent });              
            })            
          }
          break;          
          case 'ollama-pull-complete': {
            this.ngZone.run(() => {
              this.systemService.modelStatus.update(EStatus.configuring);              
            })            
          }
          break;
          case 'ollama-pull-part': {
            this.ngZone.run(() => {              
              this.systemService.modelStatus.update(EStatus.downloading, { percentage: data.partStatus });              
            })            
          }
          break;
          case 'ollama-pull-done': {
            this.ngZone.run(() => {
              this.systemService.modelStatus.update(EStatus.running);
              this.ollamaService.getAvailableLLMs();
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
              this.systemService.ingestStatus.update(EStatus.running);
            })            
          }
          break;
          case 'langchain-run-loaded': {
            this.ngZone.run(() => {
              this.systemService.ingestStatus.update(EStatus.loaded);
            })            
          }
          break;
          case 'langchain-run-splitting': {
            this.ngZone.run(() => {
              this.systemService.ingestStatus.update(EStatus.splitting);
            })            
          }
          break;
          case 'langchain-run-indexing': {
            this.ngZone.run(() => {
              this.systemService.ingestStatus.update(EStatus.indexing);
            })            
          }
          break;
          case 'langchain-run-add-chunk': {
            this.ngZone.run(() => {
              this.systemService.ingestStatus.update(EStatus.indexing, {part: data.chunk, total: data.total});
            })            
          }
          break;
          case 'langchain-run-doc-added': {
            this.ngZone.run(() => {
              if (this.mediaService.docStatus) {
                if (this.mediaService.docStatus.findIndex(f => f.name === data.source) === -1) {
                  this.mediaService.docStatus.push({
                    name: data.source,
                    status: 0,
                    text: 'embedded'
                  });
                  console.log('doc statuses:', this.mediaService.docStatus);
                }
              }
            })
          }
          break;
          case 'langchain-run-split-chunk': {
            this.ngZone.run(() => {
              this.systemService.ingestStatus.update(EStatus.splitting, {part: data.chunk, total: data.total});
            })            
          }
          break;
          case 'langchain-run-saving': {
            this.ngZone.run(() => {
              this.systemService.ingestStatus.update(EStatus.saving);
            })            
          }
          break;
          case 'langchain-run-adding'  : {
            this.ngZone.run(() => {
              this.systemService.ingestStatus.update(EStatus.adding);
            })            
          }
          break;
          case 'langchain-run-complete'  : {
            this.ngZone.run(() => {
              this.systemService.ingestStatus.update(EStatus.not_running);
            })            
          }
          break;
          case 'langchain-run-error'  : {
            this.ngZone.run(() => {
              this.systemService.ingestStatus.update(EStatus.error);
            })            
          }
          break;
          case 'langchain-run-warning'  : {
            this.ngZone.run(() => {
              this.systemService.ingestStatus.update(EStatus.warning);
            })            
          }
          break;          
        } 
      } catch (e) {
        console.error(e);
      }
    })

    effect(() => {
      this.ollamaStatus = this.ollamaService.status.getSV();
      this.modelStatus = this.systemService.modelStatus.get();
      this.ingestStatus = this.systemService.ingestStatus.get();
      this.gpuStatus = this.systemService.gpuChangeStatus.get();
      this.overallStatus = this.systemService.setOverallStatus();
      
      // console.log('overall status:', this.systemService.overallStatus());
      if (this.overallStatus === EStatus.running_unhealthy) {
        if (this.firstTime && (this.ollamaStatus.status === EStatus.running)) {
          this.ollamaService.findProcess();
          this.pullModelsIfNecessary();
        }
      }
      if (this.overallStatus === EStatus.running_healthy) {
        this.systemService.servicesDownloading = false;
        this.systemService.showGetOllama = false;
        this.systemService.startShow.update(() => false);
        if (ollamaService.servicePID === -1) {
          this.ollamaService.findProcess();
        }
        this.navigateAway();
      }
    })
  }

  toastOllamaNotRunning = async () => {
    const snackBarRef = this._snackBar.open(
      await this.commonService.get('APP.OLLAMA_NOT_RUNNING'), 
      await this.commonService.get('OK')
    );
    snackBarRef.afterDismissed().subscribe(() => {
      this.systemService.showGetOllama = true;
    });
    this.ollamaService.setOllamaCheckTimer();
  }

  navigateAway = async () => {
    if (this.firstRun) {
      this.firstRun = false;
      this.systemService.ragFiles = await this.mediaService.ls();
      /*
      if (this.mediaService.noOfValidFiles() > 0) {
        this.router.navigate(['insights']);
      } else {
        this.router.navigate(['ingest']);
      }
      */
    }
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
    const gpuAccelStr: string = await this.commonService.getEnvValue('GPU_ACCELERATION')
    this.ollamaService.gpuAcceleration = gpuAccelStr === 'true' ? true : false;
    this.systemService.osType = await this.systemService.getOSType();
    if (this.systemService.osType && (this.systemService.osType.isMac === true)) { 
      this.ollamaService.manageOllamaExternally = true; 
    };
    console.log('osType:', this.systemService.osType, this.ollamaService.manageOllamaExternally);
    this.systemService.cpu = await this.systemService.getCpu();
    this.systemService.gpu = await this.systemService.getGpu();
    this.systemService.mem = await this.systemService.getTotalMemory();
    this.systemService.disks = await this.systemService.getDisks();
    const appVersion: string | null = localStorage.getItem('LRAG_VERSION');
    const readVersion: string = await this.commonService.getEnvValue('VERSION');
    if (appVersion !== readVersion) {
      this.systemService.appVersionChange = true;
      localStorage.setItem('LRAG_VERSION', readVersion);
    }
    this.systemService.kb_link = await this.commonService.getEnvValue('KB_URL');
    this.systemService.forum_link = await this.commonService.getEnvValue('FORUM_URL');
    this.systemService.support_link = await this.commonService.getEnvValue('TICKET_URL');
    this.systemService.register_link = await this.commonService.getEnvValue('REGISTRATION_URL');
    
    setTimeout(() => {
      this.ollamaService.startServicesIfNecessary(this.toastOllamaNotRunning);  
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

  pullModelsIfNecessary = async () => {
    try {
      if (this.ollamaService.selectedModel === '') {
        await this.commonService.getEnvValue('LLM_MODEL_NAME').then((value: string) => {
          console.log('environment model llm:', value);
          this.ollamaService.selectedModel = value;
          this.ollamaService.downloadedLLM = value;          
        })
      }
      if (this.ollamaService.embeddings_model === '') {
        await this.commonService.getEnvValue('EMBEDDINGS_MODEL_NAME').then((value: string) => {
          console.log('environment embed llm:', value);
          this.ollamaService.embeddings_model = value;
          this.ollamaService.downloadedLLM = value;          
        })
      }
      console.log('pullModelsIfNecessary:getAvailableLLMs()');
      await this.ollamaService.getAvailableLLMs();
      const responseE: any = await this.ollamaService.pull(this.ollamaService.embedding_models[0].value);
      if (responseE !== 'pulled') {
        this.systemService.modelStatus.update(EStatus.downloading);      
      }
      const responseM: any = await this.ollamaService.pull(this.ollamaService.models[0].value);
      if (responseM !== 'pulled') {
        this.systemService.modelStatus.update(EStatus.downloading);
      }      
      this.firstTime = false;
      this.systemService.modelStatus.update(EStatus.running);
      this.systemService.hasBasicSetup = true;     
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
            message: await this.commonService.get('APP.EXIT_ARE_YOU_SURE')
          }
        }
      });
    dialogRef.afterClosed().subscribe(async (result) => {
      console.log(`Dialog result: ${result}`);
      if (result === true) {
        const result = await this.commonService.quitApp();
        console.log('app quit:', result);
      }
    });
  }

  forceExit = async (lang_token_id: string = 'GPU_CHANGE_RESTART', notrestart = false) => {
    console.log('forcing exit!', notrestart);
    const dialogRef = this.dialog.open(
      AlertComponent, {
        data: {
          type: 2,
          params: {
            message: await this.commonService.get(lang_token_id)
          }
        }
      });
    if (!notrestart) {
      dialogRef.afterClosed().subscribe(async () => {
        await this.commonService.quitApp();      
      });
    }
  } 
}

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

export const MAX_OCR_WAIT_PAGE: number = 120000;

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

  ocrPageTimeout: any;

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
                await this.systemService.refreshFileList(this.mediaService);
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
                await this.systemService.refreshFileList(this.mediaService);
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
                await this.systemService.refreshFileList(this.mediaService);
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
                await this.systemService.refreshFileList(this.mediaService);
              }                            
            })
          }
          break;
          case 'ocr-processor-all-complete': {
            this.ngZone.run(async () => {
                this.systemService.ocrComplete.set(true);              
            })
          }
          break;
        }
      } catch (e) {
        console.error(e);
      }
    })

    this.bridgeService.ocrLocalCallback((ev: any, eventObj: any) => {
      try {          
        const { type, data } = eventObj;
        console.log('type', type, 'data', data);        
        switch(type) {
          case 'ocr-local-processor-error': {
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
                await this.systemService.refreshFileList(this.mediaService);
              }                            
            })            
          }
          break;
          case 'ocr-local-processor-start': {
            this.ngZone.run(async () => {
              if (this.mediaService.docStatus) {
                const fIdx: number = this.mediaService.docStatus.findIndex(f => f.name === data.localfile);
                if (fIdx > -1) {
                  this.mediaService.docStatus[fIdx].status = 2;
                  this.mediaService.docStatus[fIdx].text = await this.commonService.get('PAGES.INGEST.OCR_START');
                } else {
                  console.log('ocr-processor-put:', data.localfile);
                  this.mediaService.docStatus.push({
                    name: data.localfile,
                    status: 2,
                    text: await this.commonService.get('PAGES.INGEST.OCR_START')
                  });               
                }
                await this.systemService.refreshFileList(this.mediaService);
              }                            
            })
          }
          break;
          case 'ocr-pdf-to-image-progress': {
            this.ngZone.run(() => {
              this.systemService.ingestStatus.update(EStatus.extracting, { percentage: Math.floor(Number(data.counter * 100 / data.total)) })
            });
          }
          break;
          case 'ocr-local-images-to-local-progress': {
            this.ngZone.run(() => {
              const percentage: number = Math.floor(Number(data.counter * 100 / data.total));
              if (this.ocrPageTimeout) {
                clearTimeout(this.ocrPageTimeout);
              }
              this.ocrPageTimeout = setTimeout(async () => {
                const dialogRef = this.dialog.open(
                  AlertComponent, {
                    data: {
                      type: 2,
                      params: {
                        message: await this.commonService.get('OCR_TIMEOUT')
                      }
                    }
                  });
                  dialogRef.afterClosed().subscribe(async () => {                    
                  });                
              }, MAX_OCR_WAIT_PAGE);
              this.systemService.ingestStatus.update(EStatus.preparing, { percentage })
            });
          }
          break;
          case 'ocr-local-processor-finish': {
            this.ngZone.run(async () => {
              if (this.mediaService.docStatus) {
                const fIdx: number = this.mediaService.docStatus.findIndex(f => f.name === data.localfile);
                if (fIdx > -1) {
                  this.mediaService.docStatus[fIdx].status = 2;
                  this.mediaService.docStatus[fIdx].text = await this.commonService.get('PAGES.INGEST.OCR_COMPLETE');
                } else {
                  this.mediaService.docStatus.push({
                    name: data.localfile,
                    status: 2,
                    text: await this.commonService.get('PAGES.INGEST.OCR_COMPLETE')
                  });               
                }
                await this.systemService.refreshFileList(this.mediaService);
              }                            
            })
          }
          break;
          case 'ocr-local-processor-complete': {
            this.ngZone.run(async () => {
              if (this.ocrPageTimeout) {
                clearTimeout(this.ocrPageTimeout);
              }
              if (this.mediaService.docStatus) {
                this.mediaService.docStatus.push({
                  name: data.mdlocalfile,
                  status: 0,
                  text: await this.commonService.get('PAGES.INGEST.OCR_DONE')
                });               
                // }
                await this.systemService.refreshFileList(this.mediaService, true);
              }                            
            })
          }
          break;
          case 'ocr-local-processor-all-complete': {
            this.ngZone.run(async () => {
              this.systemService.ocrComplete.set(true);              
              this.systemService.ingestStatus.update(EStatus.not_running)
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
          }
          break;
          case 'shell-running-exit':
            this.ngZone.run(async () => {              
            })
          break;
          case 'brew-running-exit':
            this.ngZone.run(() => {              
            })
          break;
          case 'winget-running-exit':
            this.ngZone.run(() => {              
            })
          break;
          case 'service-prereq-check-stdout':
            this.ngZone.run(() => {
              const { serviceName, prereq, url, brew, winget, version, expectedVersion, shellCommands } = data;            
              console.log('service-prereq-check-std:', data);                              
            })
          break;
          case 'service-prereq-check-stderr':
            this.ngZone.run(() => {
              const { serviceName, prereq, url, brew, winget, shellCommands } = data;
              console.log('service-prereq-check-err:', data);              
            })
          break;
          case 'service-download-complete': {
            this.ngZone.run(() => {
              if (data.serviceName === 'ollama' || data.serviceName === 'ollamaNoGPU') {
                this.ollamaService.status.update(EStatus.extracting);
              } else if (data.serviceName === 'reranker') {
                this.rerankerService.status.update(EStatus.extracting);
              }
            })
          }
          break;
          case 'service-download-part': {
            this.ngZone.run(() => {
              this.systemService.servicesDownloading = true;
              if (data.serviceName === 'ollama' || data.serviceName === 'ollamaNoGPU') {
                this.ollamaService.status.update(EStatus.downloading, { percentage: data.percentage });                
              } else if (data.serviceName === 'reranker') {
                this.rerankerService.status.update(EStatus.downloading, { percentage: data.percentage });                
              }
            })
          }
          break;
          case 'service-extract-download-starting': {
            this.ngZone.run(async () => {
              if (data.serviceName === 'ollama' || data.serviceName === 'ollamaNoGPU') {
                this._snackBar.open(
                  await this.commonService.get('APP.OLLAMA_DOWNLOADING'),
                  await this.commonService.get('OK'), {
                    duration: 20000,
                  }
                );              
                this.ollamaService.status.update(EStatus.preparing);
              } else if (data.serviceName === 'reranker') {
                this.rerankerService.status.update(EStatus.preparing);
              }
            })
          }
          break;
          case 'service-extract-extract-starting': {
            this.ngZone.run(async () => {
              if (data.serviceName === 'ollama' || data.serviceName === 'ollamaNoGPU') {
                this.ollamaService.status.update(EStatus.extracting);
              } else if (data.serviceName === 'reranker') {
                this.rerankerService.status.update(EStatus.extracting);
              }
            })
          }
          break;
          case 'service-extract-download-done': {
            this.ngZone.run(() => {
              if (data.serviceName === 'ollama' || data.serviceName === 'ollamaNoGPU') {
                this.ollamaService.status.update(EStatus.downloaded);
                if (data.checksPassed) {
                  this.ollamaService.startOnTimer(this.toastOllamaNotRunning);
                }
              } else if (data.serviceName === 'reranker') {
                this.rerankerService.status.update(EStatus.downloaded);
                if (data.checksPassed) {                
                  this.rerankerService.startIfNecessary();
                }                
              }
            })
          }
          break;
          case 'service-installed-updated-done': {
            this.ngZone.run(() => {
              console.log('service:installed:starting:', data.serviceName);
              if (data.serviceName === 'ollama' || data.serviceName === 'ollamaNoGPU') {
                this.ollamaService.status.update(EStatus.installed);
                this.ollamaService.startOnTimer();
              } else if (data.serviceName === 'reranker') {
                this.rerankerService.status.update(EStatus.installed);
                this.rerankerService.startIfNecessary();                
              }
            })
          }
          break;
          case 'service-start': {

          }
          break;
          case 'service-ready-state': {
            this.ngZone.run(() => {
              if ((data.serviceName === 'ollama' || data.serviceName === 'ollamaNoGPU') && (data.ready === true)) {
                this.ollamaService.status.update(EStatus.running);
              } else if (data.serviceName === 'reranker' && (data.ready === true)) {
                this.rerankerService.status.update(EStatus.running);
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
            const { serviceName, mode } = data;
            console.log('service-stop:', serviceName, mode);
            this.ngZone.run(() => {
              if (serviceName === 'reranker' && mode === 1) {                
                this.rerankerService.restartWhenGone();
              }
            });
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
              this.systemService.gpuChangeStatus.update(EStatus.not_running);
              this.systemService.modelStatus.update(EStatus.not_running);
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
                  // console.log('doc statuses:', this.mediaService.docStatus);
                }
              }
            })            
          }
          break;
          /*
          case 'langchain-run-doc-error': {
            this.ngZone.run(async () => {              
              if (this.mediaService.docStatus) {
                const fIdx: number = this.mediaService.docStatus.findIndex(f => f.name === data.source);
                if (fIdx > -1) {
                  console.log('doc:error:fIdx', data.source, data.error);
                  this.mediaService.docStatus[fIdx].text = data.error;              
                  this.mediaService.docStatus[fIdx].status = 1;
                } else {
                  console.log('doc:error:new', data.source, data.error);
                  this.mediaService.docStatus.push({
                    name: data.source,
                    status: 1,
                    text: data.error
                  });
                }
              }
            });
          }
          break;
          */
          case 'langchain-run-has-ocr': {
            this.ngZone.run(() => {
              this.systemService.hasOCR.set(true);
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
                  // console.log('doc statuses:', this.mediaService.docStatus);
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
    if (this.firstRun && this.commonService.accept_eua && this.commonService.accept_pp && this.commonService.accept_security) {
      this.firstRun = false;
      // await this.systemService.refreshFileList(this.mediaService);
      this.router.navigate(['insights']);
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
    this.ollamaService.useTesseractJS = (await this.commonService.getEnvValue('USE_TESSERACTJS') === 'true') ? true : false;    
    this.systemService.useQuantum = (await this.commonService.getEnvValue('QUANTUM_ENC') === 'true') ? true : false;    
    const apiKey: string = await this.commonService.getEnvValue('OLLAMA_API_KEY');
    if (apiKey && apiKey.length > 50) {
      console.log('APIKEY:', apiKey);
      this.ollamaService.apiKey = apiKey;
    }
    await this.ollamaService.getGpuAcceleration();    
    this.systemService.osType = await this.systemService.getOSType();
    await this.ollamaService.getManagedExternally();
    /*
    if (this.systemService.osType && (this.systemService.osType.isMac === true)) { 
      this.ollamaService.manageOllamaExternally = true; 
    };
    */
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
    this.commonService.pp_link = await this.commonService.getEnvValue('PRIVACY_POLICY_URL');
    this.commonService.eua_link = await this.commonService.getEnvValue('EUA_URL');
    this.commonService.security_link = await this.commonService.getEnvValue('SECURITY_URL');
    const lc_pp = await this.commonService.getEnvValue('LC_PP');
    const lc_eua = await this.commonService.getEnvValue('LC_EUA');
    const lc_security = await this.commonService.getEnvValue('LC_SECURITY');
    this.commonService.accept_pp = (await this.commonService.getEnvValue('ACCEPT_PP') === 'true') && this.commonService.pp_link.endsWith(lc_pp) ? true : false;
    this.commonService.accept_eua = (await this.commonService.getEnvValue('ACCEPT_EUA') === 'true') && this.commonService.eua_link.endsWith(lc_eua)? true : false;
    this.commonService.accept_security = (await this.commonService.getEnvValue('ACCEPT_SECURITY') === 'true') && this.commonService.security_link.endsWith(lc_security) ? true : false;
    
    setTimeout(() => {
      this.ollamaService.startServicesIfNecessary(this.systemService.osType, this.toastOllamaNotRunning);
      /*
      * Comment out since only necessary for reload
      */
      // this.ollamaService.startOnTimer();
      // this.rerankerService.startIfNecessary();          
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
      await this.ollamaService.getAvailableLLMs();      
      console.log('available models:', this.ollamaService.availableModels);
      if (this.ollamaService.selectedModel === '') {
        await this.commonService.getEnvValue('LLM_MODEL_NAME').then((value: string) => {
          console.log('environment check model llm:', value);
          if (this.ollamaService.availableModels.findIndex(f => f.name === value) > -1) { 
            this.ollamaService.selectedModel = value;
            this.ollamaService.downloadedLLM = value;
          } else {
            this.ollamaService.selectedModel = this.ollamaService.models[0].value;
            this.ollamaService.downloadedLLM = this.ollamaService.models[0].value;
          }
        })
      }
      if (this.ollamaService.embeddings_model === '') {
        await this.commonService.getEnvValue('EMBEDDINGS_MODEL_NAME').then((value: string) => {
          console.log('environment check embed llm:', value);
          if (this.ollamaService.availableModels.findIndex(f => f.name === value) > -1) {
            this.ollamaService.embeddings_model = value;
            this.ollamaService.downloadedEmbeddedLLM = value;
          } else {
            this.ollamaService.embeddings_model = this.ollamaService.embedding_models[0].value;
            this.ollamaService.downloadedEmbeddedLLM = this.ollamaService.embedding_models[0].value;
          }
        })
      }
      if (this.ollamaService.ocr_model === '') {
        await this.commonService.getEnvValue('OCR_MODEL_NAME').then((value: string) => {
          console.log('environment check ocr llm:', value);
          if (this.ollamaService.availableModels.findIndex(f => f.name === value) > -1) {
            this.ollamaService.ocr_model = value;
            this.ollamaService.downloadedOCRLLM = value;
          } else {
            this.ollamaService.ocr_model = this.ollamaService.ocr_models[0].value;
            this.ollamaService.downloadedOCRLLM = this.ollamaService.ocr_models[0].value;
          }
        })
      }
      console.log('pullModelsIfNecessary:getAvailableLLMs()');
      const responseE: any = await this.ollamaService.pull(this.ollamaService.embedding_models[0].value);
      if (responseE !== 'pulled') {
        this.systemService.modelStatus.update(EStatus.downloading);      
      }
      const responseM: any = await this.ollamaService.pull(this.ollamaService.models[0].value);
      if (responseM !== 'pulled') {
        this.systemService.modelStatus.update(EStatus.downloading);
      }
      if (!this.ollamaService.useTesseractJS) {
        const responseO: any = await this.ollamaService.pull(this.ollamaService.ocr_models[0].value);
        if (responseO !== 'pulled') {
          this.systemService.modelStatus.update(EStatus.downloading);
        }            
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

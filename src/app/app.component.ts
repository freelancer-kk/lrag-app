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
  @ViewChild('sidenav', {static: true}) sidenav!: MatSidenav;
  isExpanded: boolean = true;
  dockerConnectInterval: any;
  firstTime: boolean = true;

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
        console.log('type', type, 'data', data);        
        switch(type) {
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
          case 'langchain-run-split': {
            this.ngZone.run(() => {
              this.systemService.ingestStatus.update(() => 'chunking');
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
        } 
      } catch (e) {
        console.error(e);
      }
    })

    effect(() => {
      console.log('ollama status:', this.systemService.ollamaStatus());
      console.log('model status:', this.systemService.modelStatus());
      this.systemService.calcOverallStatus();
      console.log('overall status:', this.systemService.overallStatus());
      if (this.systemService.overallStatus() === "running: unhealthy") {
        if (this.firstTime) {
          this.pullModelsIfNecessary().then(() => {
            this.firstTime = false;
          })
        }
      }
    })
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
    this.systemService.cpu = await this.systemService.getCpu();
    this.systemService.gpu = await this.systemService.getGpu();
    this.systemService.mem = await this.systemService.getTotalMemory();
    this.systemService.disks = await this.systemService.getDisks(); 
    this.startServicesIfNecessary();   
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
    const { isReady } = await this.systemService.commandOllama('isRunning');
    console.log('ollama is running:', isReady);
    if (!isReady) {
      this.systemService.ollamaStatus.update(() => 'starting');
      await this.systemService.commandOllama('start');
    } else {
      this.systemService.ollamaStatus.update(() => 'running');      
    }
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
      await this.systemService.getAvailableLLMs();
      if (this.systemService.availableModels.length === 0) {
        this.systemService.modelStatus.update(() => 'downloading model');
        await this.systemService.commandOllama('pull', { model: this.systemService.embeddings, stream: true});
        await this.systemService.commandOllama('pull', { model: this.systemService.models[0].value, stream: true});
        this.systemService.modelStatus.update(() => 'running');
      } else {
        this.systemService.modelStatus.update(() => 'running');
      }          
    } catch (e) {
      console.error(e);
    }    
  }  
}

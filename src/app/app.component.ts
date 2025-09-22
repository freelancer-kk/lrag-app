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
  wt: any;

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
    this.bridgeService.eventCallback((ev: any, result: any) => {
      try {          
        const eventObj: any = JSON.parse(result.response);
        const name = eventObj.Actor.Attributes.name;        
        const { Action, status } = eventObj;
        console.log('de:', 'action', Action, 'name', name, 'status', status);        
      } catch (e) {
        console.error(e);
      }
    })

    effect(() => {
      if (this.systemService.isHealthy()) {
        this.pullModelsIfNecessary();
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

  showDownloadImageWarning = (message: string = '') => {
    this.wt = setTimeout(async () => {
      this.wt = undefined
      this._snackBar.open(
        message === '' ? await this.systemService.get('APP.DOWNLOAD_IMAGE_WARNING') : message, 
        await this.systemService.get('OK')
      );
    }, 1000)
  }

  clearDownloadImageWarning = () => {
    if (this.wt) {
      clearTimeout(this.wt);
    }    
  }

  startServicesIfNecessary = async () => {    
    // Check if ollama is running      
  } 

  restart = async (event: any) => {
    this.systemService.recommendRestart = false;
    this.systemService.commandOllama('stop');
    /*
      console.log('all services removed:', result);
      // Remove data directory
      await this.mediaService.cleanData();
      await this.startServicesIfNecessary();    
    */
  }

  pullModelsIfNecessary = async () => {
    try {
      let firstTime = false;
      if (this.systemService.selectedModel === '') {
        this.systemService.getEnvValue('LLM_MODEL_NAME').then((value: string) => {
          console.log('env llm:', value);
          this.systemService.selectedModel = value;
          this.systemService.downloadedLLM = value;
          firstTime = true;
        })
      }
      await this.systemService.getAvailableLLMs();
      if (this.systemService.availableModels.length === 0) {
        await this.systemService.commandOllama('pull', { model: this.systemService.embeddings });
        await this.systemService.commandOllama('pull', { model: this.systemService.models[0].value});
      }
      // Run selected model
      if (firstTime) {
        await this.systemService.getRunningModelsUsage();
      }
    } catch (e) {
      console.error(e);
    }    
  }  
}

import { Injectable, signal } from '@angular/core';
import { BridgeService } from '../bridge/bridge.service';
import {FormControl} from '@angular/forms';
import { ConnectionService, ConnectionState } from 'ng-connection-service';
import { Subscription, tap } from 'rxjs';
import { connOptions, EStatus, IChat, IHistory } from '../../../shared/model';
import { OllamaService } from '../ollama-service';
import { CommonService, LStatus } from '../common-service';
import { RerankerService } from '../reranker-service';
import { WatcherService } from '../watcher-service';
import { SettingsService } from '../settings-service';


@Injectable({
  providedIn: 'root'
})
export class SystemService {
  
  mainStatus: LStatus = new LStatus(EStatus.not_running);
  modelStatus: LStatus = new LStatus(EStatus.unknown);
  ingestStatus: LStatus = new LStatus(EStatus.not_running);
  insightStatus: LStatus = new LStatus(EStatus.not_running);
  gpuChangeStatus: LStatus = new LStatus(EStatus.not_running);
  
  ocrComplete = signal(false);
  hasOCR = signal(false);
  power: number = 50;
  cpu: any;
  gpu: any;
  mem: any;
  disks: any;
  startShow = signal(false);
  selectedDocuments = new FormControl('');
  totalMainMemory = 0;
  ocr_pdf_link: string = "https://acrobat.adobe.com/link/acrobat/ocr-pdf?x_api_client_id=adobe_com&x_api_client_location=ocr_pdf";
  ollama_get_link: string = "https://ollama.com/download";
  appVersionChange: boolean = false;

  MAX_FILES: number = 10;
  ragFiles: any[] = [];
  dark: boolean = true;
  docsEmpty: boolean = true;
  osType: any;
  chatHistory: IChat[] = [];
  brand: string = '';
  chunkSize: number = 512;
  overlap: number = 48;
  filter: string | undefined = undefined;
  k: number = 8;
  numCtx: number = 2048;
  separator: string = ';';
  useSemantic: boolean = false;
  localVector: boolean = false;
  collection: string = 'general';
  collections: any[] = [];
  selectedCollections = new FormControl(null);
  ragPrompt: string | undefined = undefined;
  userPrompt: string | undefined = undefined;
  
  currentState!: ConnectionState;
  subscription = new Subscription();
  status!: string;
  history: IHistory[] = [];
  question: string | undefined;
  historyExpanded: boolean = false;
  hasBasicSetup: boolean = false;

  showGetOllama: boolean = false;
  servicesDownloading: boolean = false;

  kb_link: string | undefined;
  forum_link: string | undefined;
  support_link: string | undefined;
  register_link: string | undefined;
  firstTime: boolean = true;
  
  constructor(
    private bridgeService: BridgeService,
    private connectionService: ConnectionService,
    private settingsService: SettingsService,
    private commonService: CommonService,
    private ollamaService: OllamaService,
    private rerankerService: RerankerService,
    private watcherService: WatcherService
  ) {}

  saveMainHistory = () => {
    this.history.splice(25);
    localStorage.setItem('history', JSON.stringify(this.history))
  }

  init = (): void => {
    this.subscription.add(
      this.connectionService.monitor(connOptions).pipe(
        tap(async (newState: ConnectionState) => {
          this.currentState = newState;

          if (this.currentState.hasNetworkConnection) {
            this.status = 'online';            
            if (this.firstTime) {
              this.firstTime = false;
              this.settingsService.getLicense().then(() => {
                this.ollamaService.fetchModelList(); 
                if (this.settingsService.isActivePro()) {
                  this.MAX_FILES = 50;
                }
              })            
            }
          } else {
            this.status = 'offline';
          }
        })
      ).subscribe()
    );
  }

  destroy = (): void => {
    this.subscription.unsubscribe();
  }

  saveChunkSettings = () => {
    localStorage.setItem('chunk-settings', JSON.stringify({
      chunkSize: this.chunkSize,
      overlap: this.overlap,
      useSemantic: this.useSemantic,
      localVector: this.localVector,
      collection: this.collection
    }))
    console.log(localStorage.getItem('chunk-settings'));
  }

  saveInsightSettings = () => {
    localStorage.setItem('insight-settings', JSON.stringify({
      k: this.k,
      filter: this.filter,
      numCtx: this.numCtx,
      ragPrompt: this.ragPrompt,
      userPrompt: this.userPrompt
    }))
  }

  setOverallStatus = (): EStatus => {
    if (this.ollamaService.status.get() === EStatus.running) {
      if (this.modelStatus.get() === EStatus.running && this.watcherService.status.get() === EStatus.running && this.rerankerService.status.get() === EStatus.running && this.ingestStatus.get() === EStatus.not_running && this.gpuChangeStatus.get() === EStatus.not_running) {
        this.mainStatus.update(EStatus.running_healthy);
      } else {
        this.mainStatus.update(EStatus.running_unhealthy);
      }     
    } else {
      this.mainStatus.update(EStatus.not_running);
    }
    return this.mainStatus.get();
  }
  

  commandInsight = (command: string, options: any = {}): Promise<any> => {
    return new Promise((resolve, reject) => { 
      this.bridgeService.chat(50, command, options, async (data: any) => {
        // console.log('insight command response:', data);
        resolve(data);
      });
    });
  }  

  commandIngest = (command: string, options: any = {}): Promise<any> => {
    return new Promise((resolve, reject) => { 
      this.bridgeService.ingest(60, command, options, async (data: any) => {
        console.log('ingest command response:', data);
        resolve(data);
      });
    });
  }  
  
  lragfiles = (command: string, options: any): Promise<any> => {
    return new Promise((resolve, reject) => {
      this.bridgeService.lragfiles(70, command, options, async (data: any) => {
        resolve(data);        
      });
    })
  }

  hasEmbedded = (): boolean => {
    return this.ragFiles.reduce(
      ((acc: boolean, cur: any) => acc || cur.text === 'embedded')
      , false);
  }
  
  getCpu = (): Promise<any> => {
    return new Promise((resolve, reject) => {
      this.bridgeService.getCpu(1, async (data: any) => {
        const { machineId, brand, speed, cores } = data;
        if (cores < 16) {
          this.power = this.power / 1.5;
        }
        if (cores > 32) {
          this.power = this.power * 1.5;
        }
        resolve({
          "machineId": machineId,
          "name": await this.commonService.get("SYSTEM.CPU"),
          "brand": brand,
          "speed": speed,
          "threads": cores
        });      
      });
    })    
  }

  getGpu = (): Promise<any> => {
    return new Promise((resolve, reject) => {
      this.bridgeService.getGpu(2, async (data: any) => {
        const { controllers } = data;
        const gpuDevices: any[] = [];
        if (controllers) {
          controllers.forEach((gpu: any) => {
            const { model, vram } = gpu;
            gpuDevices.push({
              model,
              vram: Math.ceil(vram/1024)
            })                  
          })
        }
        
        let device: any = {}
        if (gpuDevices.length > 0) {        
          device = gpuDevices.sort((a: any, b:any) => b.vram - a.vram)[0];
          device.brand = '';
          const ldevice: string = device.model.toLowerCase();
          if (ldevice.indexOf('nvidia')> -1) {
            device.brand = 'Nvidia';
          } else if (ldevice.indexOf('amd')> -1) {
            device.brand = 'Amd';
          }  else if (ldevice.indexOf('intel')> -1) {
            device.brand = 'Intel';
          }
        } else {
          device = {
            name: await this.commonService.get("SYSTEM.GPU"),
            brand: '',
            model: 'none',
            vram: 0
          }
        }
        if (device.vram > 16) {
          this.power = this.power * 1.8;
        }
        if (device.vram < 8) {
          this.power = this.power / 1.8;
        }
        this.brand = device.brand;
        resolve({
          "name": await this.commonService.get("SYSTEM.GPU"),
          "brand": device.brand, 
          "gpu": device.model,
          "vram": device.vram
        });
      });
    })    
  }

  getTotalMemory = (): Promise<any> => {
    return new Promise((resolve, reject) => {
      this.bridgeService.getMem(3, async (data: any) => {
        let { total } = data;
        total = Math.ceil(total/1024/1024/1024);
        if (total > 32) {
          this.power = this.power * 1.4;
        }
        if (total < 8) {
          this.power = this.power / 1.4;
        }
        this.totalMainMemory = total;
        resolve({
          "name": await this.commonService.get("SYSTEM.MEM"),
          "totalGB": total
        });      
      });
    })    
  }

  getOSType = (): Promise<any> => {
    return new Promise((resolve, reject) => {
      this.bridgeService.getOSType(4, async (data: any) => {
        resolve(data);      
      });
    })    
  }

  getDisks = (): Promise<any> => {
    return new Promise((resolve, reject) => {
      this.bridgeService.getDisks(5, async (disks: any) => {
        const data: any = {
          disks: {}
        };
        if (disks) {
          disks.forEach((disk: any) => {
            const { _used, _available, _mounted, _capacity } = disk;
            data.disks[_mounted] =  {
              capacity: _capacity,
              sizeGB: Math.ceil((Number(_used) + Number(_available))/1024/1024/1024)
            }
          })
        }
        resolve(data);        
      });
    })    
  }
}

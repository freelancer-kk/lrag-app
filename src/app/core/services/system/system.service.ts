import { Injectable, signal } from '@angular/core';
import { BridgeService } from '../bridge/bridge.service';
import {FormControl} from '@angular/forms';
import { ConnectionService, ConnectionState } from 'ng-connection-service';
import { Subscription, tap } from 'rxjs';
import { connOptions, EStatus, IChat, IHistory } from '../../../shared/model';
import { OllamaService } from '../ollama-service';
import { CommonService } from '../common-service';

@Injectable({
  providedIn: 'root'
})
export class SystemService {
  
  power: number = 50;
  cpu: any;
  gpu: any;
  mem: any;
  disks: any;
  overallStatus = signal<any>('not running');
  modelStatus = signal<any>('unknown');
  ingestStatus = signal<any>('not running');
  insightStatus = signal<any>("not running");
  gpuChangeStatus = signal<any>("not running");
  startShow = signal(false);
  selectedDocuments = new FormControl('');
  totalMainMemory = 0;
  ocr_pdf_link: string = "https://acrobat.adobe.com/link/acrobat/ocr-pdf?x_api_client_id=adobe_com&x_api_client_location=ocr_pdf";
  ollama_get_link: string = "https://ollama.com/download";
  appVersionChange: boolean = false;

  MAX_FILES: number = 15;
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
  localVector: boolean = true;
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
  
  constructor(
    private bridgeService: BridgeService,
    private connectionService: ConnectionService,
    private commonService: CommonService,
    private ollamaService: OllamaService
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
            this.ollamaService.fetchModelList();
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

  calcOverallStatus = () => {
    if (this.ollamaService.status.get() === EStatus.running) {
      if (this.modelStatus() === 'running' && this.ingestStatus() === 'not running' && this.gpuChangeStatus() === 'not running') {
        this.overallStatus.update(() => 'running: healthy');
      } else {
        this.overallStatus.update(() => 'running: unhealthy');
      }     
    } else {
      this.overallStatus.update(() => 'not running');
    }
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

  getClassFromStatus = (status: string): string => {
    if (status === 'running' || status === 'configuring' || status === 'extracting' || status === 'reranking' || status === 'thinking' || status === 'uploading' || status.startsWith('splitting') || status === 'uploaded' || status === 'loading' || status === 'loaded' || status.startsWith('indexing') || status === 'saving' || status === 'adding' || status === 'running: healthy' || status === 'health_status: healthy' || status === 'exited') {
      return 'chip-success';
    } else if (status.startsWith('downloading') || status === 'starting' || status === 'running: unhealthy') {
      return 'chip-warning';
    } else if ((status === 'die') || (status === 'error') || (status === 'destroy')) {
      return 'chip-error';
    } else {
      return 'chip';
    }
  }

  getIconFromStatus = (status: string) => {
    switch (status) {

      case 'uploading':
      case 'uploaded':
      case 'loaded':
      case 'loading':
      case 'indexing':
      case 'splitting':
      case 'extracting':
      case 'saving':        
      case 'adding':
      case 'thinking':
      case 'reranking':
      case 'configuring':
      case 'running: healthy': 
      case 'running': {
        return 'directions_run';
      }
      case 'created': {
        return 'create';
      }
      case 'unpause':
      case 'start':
      case 'starting': {
        return 'start';
      }
      case 'restarting': {
        return 'restart_alt';
      }
      case 'error':
      case 'destroy':
      case 'die':
      case 'running: unhealthy':
      case 'exited': {
        return 'exit_to_app';
      }
      case 'pause':
      case 'paused': {
        return 'pause';
      }
      case 'downloading': {
        return 'file_download';
      }
      case 'health_status: healthy': {
        return 'health_and_safety';
      }
      case 'dead': {
        return 'block';
      }
      default:
      case 'not running': {
        return 'question_mark';
      }    
    }
  }
  
  getCpu = (): Promise<any> => {
    return new Promise((resolve, reject) => {
      this.bridgeService.getCpu(1, async (data: any) => {
        const { brand, speed, cores } = data;
        if (cores < 16) {
          this.power = this.power / 1.5;
        }
        if (cores > 32) {
          this.power = this.power * 1.5;
        }
        resolve({
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
  
  openExternal = (url: string): Promise<void> => {
    return new Promise((resolve, reject) => {
      this.bridgeService.openExternal(6, url, async () => {
        resolve();      
      });
    })    
  }

  quitApp = (): Promise<void> => {
    return new Promise((resolve, reject) => {
      this.bridgeService.quitApp(10, async () => {
        resolve();
      });
    })
  }
}

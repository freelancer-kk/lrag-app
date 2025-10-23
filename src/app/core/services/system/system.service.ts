import { Injectable, inject, signal } from '@angular/core';
import { BridgeService } from '../bridge/bridge.service';
import { TranslateService } from '@ngx-translate/core';
import {FormControl} from '@angular/forms';
import path from 'path';
import { ConnectionService, ConnectionServiceOptions, ConnectionState } from 'ng-connection-service';
import { Subscription, tap } from 'rxjs';

export enum EWho {
  User = 0,
  Assistant
}
export interface IChat {
  who: EWho,
  content: string
}

export interface IGenInfo {
  model: string,
  created_at: number,
  done: boolean,
  total_duration: number,
  load_duration: number,
  prompt_eval_count: number,
  prompt_eval_duration: number,
  eval_count: number,
  eval_duration: number
}

export interface IHistory {
  when: Date,
  text: string,
  expanded: boolean,
  genInfo?: IGenInfo
}

const options: ConnectionServiceOptions = {
  enableHeartbeat: true,
  heartbeatUrl: 'https://google.com',
  heartbeatInterval: 10000
}
  
@Injectable({
  providedIn: 'root'
})
export class SystemService {
  private translate = inject(TranslateService)

  power: number = 50;
  cpu: any;
  gpu: any;
  mem: any;
  disks: any;
  availableModels: any[] = [];
  overallStatus = signal<any>('not running');
  modelStatus = signal<any>('unknown');
  ollamaStatus = signal<any>('not running');
  ingestStatus = signal<any>('not running');
  insightStatus = signal<any>("not running");
  gpuChangeStatus = signal<any>("not running");
  selectedDocuments = new FormControl('');
  totalMainMemory = 0;
  ocr_pdf_link: string = "https://acrobat.adobe.com/link/acrobat/ocr-pdf?x_api_client_id=adobe_com&x_api_client_location=ocr_pdf";
  ollama_get_link: string = "https://ollama.com/download";

  selectedModel: string = ''
  downloadedLLM: string = '';
  MAX_FILES: number = 15;
  ragFiles: any[] = [];
  dark: boolean = true;
  docsEmpty: boolean = true;
  gpuAcceleration: boolean = true;
  osType: any;
  chatHistory: IChat[] = [];
  ollamaPID: number = -1;
  brand: string = '';
  manageOllamaExternally: boolean = false;
  showGetOllama: boolean = false;
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
  modelsDownloaded: boolean = false;
  history: IHistory[] = [];
  
  models: any[] = [
    {value: 'gemma3:1b', viewValue: 'gemma3:1b (<1GB)', thinking: false, memory: 1},    
    {value: 'granite3-dense:2b', viewValue: 'granite3-dense:2b (<2GB)', thinking: true, memory: 2},
    {value: 'nemotron-mini:4b', viewValue: 'nemotron-mini:4b (<3GB)', thinking: true, memory: 3},
    {value: 'llama3-chatqa:8b', viewValue: 'llama3-chatqa:8b (<5GB)', thinking: true, memory: 5},
    {value: 'llama3.1:8b', viewValue: 'llama3.1:8b (<5GB)', thinking: true, memory: 5},
    {value: 'gemma3:12b', viewValue: 'gemma3:12b (<9GB)', thinking: true, memory: 8},
    {value: 'deepseek-r1:14b', viewValue: 'deepseek-r1:14b (<12GB)', thinking: true, memory: 9}    
  ];

  embedding_models: any[] = [
    {value: 'embeddinggemma:300m', viewValue: 'embeddinggemma:300m (<1GB)', thinking: false, memory: 1},
    {value: 'nomic-embed-text:v1.5', viewValue: 'nomic-embed-text:v1.5 (<1GB)', thinking: false, memory: 1},
    {value: 'mxbai-embed-large:335m', viewValue: 'mxbai-embed-large:335m (<1GB)', thinking: false, memory: 1},
    {value: 'bge-m3:567m', viewValue: 'bge-m3:567m (<1GB)', thinking: false, memory: 1},
    {value: 'all-minilm:22m', viewValue: 'all-minilm:22m (<1GB)', thinking: false, memory: 1},
    {value: 'bge-large:335m', viewValue: 'bge-large:335m (<1GB)', thinking: false, memory: 1},
    {value: 'qwen3-embedding:0.6b', viewValue: 'qwen3-embedding:0.6b (<1GB)', thinking: false, memory: 1}
  ]

  embeddings_model: string = '';

  constructor(
    private bridgeService: BridgeService,
    private connectionService: ConnectionService
  ) {}

  get = (key: string): Promise<string> => {
    return new Promise((resolve, reject) => {
      this.translate.get(key)
        .subscribe((res: string) => {
            resolve(res);
        });
    })
  }

  saveMainHistory = () => {
    this.history.splice(100);
    localStorage.setItem('history', JSON.stringify(this.history))
  }

  init = (): void => {
    this.subscription.add(
      this.connectionService.monitor(options).pipe(
        tap(async (newState: ConnectionState) => {
          this.currentState = newState;

          if (this.currentState.hasNetworkConnection) {
            this.status = 'online';
            if (!this.modelsDownloaded) {
              this.modelsDownloaded = true;
              this.models = await (await fetch(
                await this.getEnvValue('MODELS_FILE'),
                {
                  method: 'GET',          
                }
              )).json();

              this.embedding_models = await (await fetch(
                await this.getEnvValue('EMBEDDED_MODELS_FILE'),
                {
                  method: 'GET',          
                }
              )).json();
              console.log('models downloaded!');
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

  getThinkingForModel = (model: string): boolean => {
    const idx = this.models.findIndex(m => m.value === model);
    if (idx > -1) {
      return this.models[idx].thinking;
    } else {
      return false;
    }
  }

  calcOverallStatus = () => {
    if (this.ollamaStatus() === 'running') {
      if (this.modelStatus() === 'running' && this.ingestStatus() === 'not running' && this.gpuChangeStatus() === 'not running') {
        this.overallStatus.update(() => 'running: healthy');
      } else {
        this.overallStatus.update(() => 'running: unhealthy');
      }     
    } else {
      this.overallStatus.update(() => 'not running');
    }
  }

  getRunningModelsUsage = async (): Promise<string> => {
    const modelUsage: any = await this.commandOllama('ps');
    for await (const entry of modelUsage.models) {      
      if (entry.model === this.selectedModel) {
        const { size, size_vram } = entry;
        
        let part = '';
        /*
        if (size-size_vram > 0) {
          part += `CPU ${Math.floor(size-size_vram / size * 100)}%`;
        }
          */
        part += ` GPU ${Math.floor(size_vram / size * 100)}%`
        return part;
      }         
    }
    return '';
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
  
  commandOllama = (command: string, options: any = {}): Promise<any> => {
    return new Promise((resolve, reject) => { 
      this.bridgeService.ollama(90, command, options, async (data: any) => {
        console.log('ollama command response:', command, options, data);
        resolve(data);
      });
    });
  }  

  findProcesses = (): Promise<any> => {
    return new Promise((resolve, reject) => { 
      this.bridgeService.ollama(91, 'find', {}, async (data: any) => {        
        resolve(data);
      });
    });
  }  

  getAvailableLLMs = async (): Promise<void> => {
    // const currentModels: any[] = this.availableModels;
    const value: any = await this.commandOllama('list');
    // console.log('getAvailableLLMs:', value.models);
    this.availableModels = value.models.map((model: any) => {
      return {
        name: model.name,
        size: Math.floor(model.size / 1024 / 1000),
        usage: model.usage
      }
    });
    // console.log('getAvailableLLMs:', this.availableModels);
  }

  getEnvValue = (key: string): Promise<string> => {
    return new Promise((resolve, reject) => {
      this.bridgeService.env(80, 'get', { key }, async (data: any) => {
        resolve(data);        
      });
    })
  }

  basename = (fullpath: string): string => {    
    return path.basename(fullpath.replace(/\\/g,'/'));
  }

  setEnvValue = (key: string, value: string): Promise<string> => {
    return new Promise((resolve, reject) => {
      this.bridgeService.env(81, 'set', {
        key,
        value
      }, async (data: any) => {
        resolve(data);        
      });
    })
  }

  writeEnv = (): Promise<string> => {
    return new Promise((resolve, reject) => {
      this.bridgeService.env(81, 'write', {}, async (data: any) => {
        resolve(data);        
      });
    })
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
          "name": await this.get("SYSTEM.CPU"),
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
            name: await this.get("SYSTEM.GPU"),
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
          "name": await this.get("SYSTEM.GPU"),
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
          "name": await this.get("SYSTEM.MEM"),
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

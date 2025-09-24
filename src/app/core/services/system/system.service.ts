import { Injectable, inject, signal } from '@angular/core';
import { BridgeService } from '../bridge/bridge.service';
import { TranslateService } from '@ngx-translate/core';

export enum EWho {
  User = 0,
  Assistant
}
export interface IChat {
  who: EWho,
  content: string
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

  selectedModel: string = ''
  downloadedLLM: string = '';
  MAX_FILES: number = 15;
  ragFiles: any[] = [];
  dark: boolean = true;
  docsEmpty: boolean = true;
  gpuAcceleration: boolean = true;
  osType: any;
  chatHistory: IChat[] = [];

  models: any[] = [
    {value: 'gemma3:1b', viewValue: 'gemma3:1b (<1GB)', thinking: false},
    {value: 'mistral:7b', viewValue: 'mistral:7b (<5GB)', thinking: true},
    {value: 'llama3.1:8b', viewValue: 'llama3.1:8b (<5GB)', thinking: true},    
    {value: 'gemma3:12b', viewValue: 'gemma3:12b (<9GB)', thinking: true},
    {value: 'deepseek-r1:14b', viewValue: 'deepseek-r1:14b (<12GB)', thinking: true},
  ];
  embeddings: string = 'embeddinggemma:300m';
  
  constructor(
    private bridgeService: BridgeService
  ) {}

  get = (key: string): Promise<string> => {
    return new Promise((resolve, reject) => {
      this.translate.get(key)
        .subscribe((res: string) => {
            resolve(res);
        });
    })
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
      if (this.modelStatus() === 'running' && this.ingestStatus() === 'not running') {
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
        if (size-size_vram > 0) {
          part += `CPU ${Math.floor(size-size_vram / size * 100)}%`;
        }
        part += ` GPU ${Math.floor(size_vram / size * 100)}%`
        return part;
      }         
    }
    return '';
  }

  commandInsight = (command: string, options: any = {}): Promise<any> => {
    return new Promise((resolve, reject) => { 
      this.bridgeService.chat(70, command, options, async (data: any) => {
        // console.log('insight command response:', data);
        resolve(data);
      });
    });
  }  

  commandIngest = (command: string, options: any = {}): Promise<any> => {
    return new Promise((resolve, reject) => { 
      this.bridgeService.ingest(80, command, options, async (data: any) => {
        console.log('ingest command response:', data);
        resolve(data);
      });
    });
  }  
  
  commandOllama = (command: string, options: any = {}): Promise<any> => {
    return new Promise((resolve, reject) => { 
      this.bridgeService.ollama(90, command, options, async (data: any) => {
        console.log('ollama command response:', data);
        resolve(data);
      });
    });
  }  

  getAvailableLLMs = async () => {
    // const currentModels: any[] = this.availableModels;
    this.availableModels = (await this.commandOllama('list')).models.map((model: any) => {
      return {
        name: model.name,
        size: Math.floor(model.size / 1024 / 1000),
        usage: model.usage
      }
    });     
  }

  getEnvValue = (key: string): Promise<string> => {
    return new Promise((resolve, reject) => {
      this.bridgeService.env(80, 'get', { key }, async (data: any) => {
        resolve(data);        
      });
    })
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
    if (status === 'running' || status === 'thinking' || status === 'uploading' || status === 'uploaded' || status === 'loading' || status === 'loaded' || status === 'splitting' || status === 'chunking' || status === 'adding' || status === 'running: healthy' || status === 'health_status: healthy' || status === 'exited') {
      return 'chip-success';
    } else if (status === 'downloading' || status === 'starting' || status === 'running: unhealthy') {
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
      case 'splitting':
      case 'chunking':        
      case 'adding':
      case 'thinking':
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
        controllers.forEach((gpu: any) => {
          const { model, vram } = gpu;
          gpuDevices.push({
            model,
            vram: Math.ceil(vram/1024)
          })                  
        })
        
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
        disks.forEach((disk: any) => {
          const { _used, _available, _mounted, _capacity } = disk;
          data.disks[_mounted] =  {
            capacity: _capacity,
            sizeGB: Math.ceil((Number(_used) + Number(_available))/1024/1024/1024)
          }
        })
        resolve(data);      
      });
    })    
  }
}

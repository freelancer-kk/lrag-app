import { Injectable, inject, signal } from '@angular/core';
import { BridgeService } from '../bridge/bridge.service';
import { TranslateService } from '@ngx-translate/core';

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
  overallStatus: string = 'not created';
  modelStatus: string = 'unknown';
  ollamaStatus: string = 'not created';
  recommendRestart: boolean = false;
  selectedModel: string = ''
  downloadedLLM: string = '';
  MAX_FILES: number = 15;
  ragFiles: any[] = [];
  dark: boolean = true;
  docsEmpty: boolean = true;
  gpuAcceleration: boolean = true;
  osType: any;
  isHealthy = signal<any>(false);

  ingestStatus: string = 'not running';
  insightStatus: string = "not running";

  unstructuredStatus = signal<any>("not running");
  models: any[] = [
    {value: 'gemma3:1b', viewValue: 'gemma3:1b (<1GB)', usage: '?% CPU'},
    {value: 'mistral:7b', viewValue: 'mistral:7b (<5GB)', usage: '?% CPU'},
    {value: 'llama3.1:8b', viewValue: 'llama3.1:8b (<5GB)', usage: '?% CPU'},    
    {value: 'gemma3:12b', viewValue: 'gemma3:12b (<9GB)', usage: '?% CPU'},
    {value: 'deepseek-r1:14b', viewValue: 'deepseek-r1:14b (<12GB)', usage: '?% CPU'},
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

  getRunningModelsUsage = async (): Promise<void> => {
    const modelUsage: any = await this.commandOllama('ps');
    // console.log('usage response:', modelUsage);
    try {
      const lines: string[] = modelUsage.split('\n');
      // console.log(lines);
      lines.splice(0, 1);
      lines.forEach((line: string) => {
        const mextracts: string[] | null = line.match(/^[0-9|a-z|A-Z|:|\.-]*/);
        const uextracts: string[] | null = line.match(/[0-9]+% (CPU|GPU)/);
        if (mextracts && mextracts.length > 0 && uextracts && uextracts.length > 0) {
          const llmName: string = mextracts[0].trim();
          const usage: string = uextracts[0].trim();
          const fIdx: number = this.availableModels.findIndex(f => f.name === llmName);
          console.log('usage:', fIdx, llmName, usage);
          if (fIdx > -1) {
            this.availableModels[fIdx].usage = usage;
          }
        }
      });
    } catch (e) {
      console.error(e);
    }    
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
    const availableModelsStr = await this.commandOllama('list');
    try {
      this.availableModels = [];    
      const lines: string[] = availableModelsStr.split('\n');
      lines.splice(0, 1);
      lines.splice(-1, 1);
      lines.forEach((line: string) => {
        const extracts: string[] | null = line.match(/^[0-9|a-z|A-Z|:|\.-]*/);
        if (extracts) {
          const modelName: string = extracts[0].trim();
          const extracts1: string[] | null = line.match(/ [0-9|\.]* (GB|MB) /);
          if (extracts1) {
            const modelSize: string = extracts1[0].trim();
            // console.log(modelName, '=>', modelSize);            
            this.availableModels.push({
              'name': modelName,
              'size': modelSize,
              'usage': ''
            })      
          }
        }
      });
    } catch (e) {
      console.error(e);
    }    
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
    if (status === 'llm running' || status === 'running' || status === 'running: healthy' || status === 'health_status: healthy' || status === 'exited') {
      return 'chip-success';
    } else if (status === 'llm downloading' || status === 'llm starting' || status === 'running: unhealthy') {
      return 'chip-warning';
    } else if ((status === 'die') || (status === 'destroy')) {
      return 'chip-error';
    } else {
      return 'chip';
    }
  }

  getIconFromStatus = (status: string) => {
    switch (status) {
      case 'llm running':
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
      case 'llm downloading':
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

  getAccelerationCompose = (): string => {
    return 'ollama' + (this.gpu && this.gpuAcceleration ? this.gpu.brand : '');
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

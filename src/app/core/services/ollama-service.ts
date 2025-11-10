import { Injectable } from '@angular/core';
import { CommonService, LStatus } from './common-service';
import { EStatus } from '../../shared/model';

@Injectable({
  providedIn: 'root'
})
export class OllamaService { 
  serviceName: string = 'ollama';
  status: LStatus = new LStatus(EStatus.not_running);
  servicePID: number = -1;  
  
  availableModels: any[] = [];
  models: any[] = [
    {value: 'gemma3:1b', viewValue: 'gemma3:1b (<1GB)', thinking: false, memory: 1, description: ''},    
    {value: 'granite3-dense:2b', viewValue: 'granite3-dense:2b (<2GB)', thinking: true, memory: 2, description: ''},
    {value: 'nemotron-mini:4b', viewValue: 'nemotron-mini:4b (<3GB)', thinking: true, memory: 3, description: ''},
    {value: 'llama3-chatqa:8b', viewValue: 'llama3-chatqa:8b (<5GB)', thinking: true, memory: 5, description: ''},
    {value: 'gemma3:12b', viewValue: 'gemma3:12b (<9GB)', thinking: true, memory: 8, description: ''},
    {value: 'deepseek-r1:14b', viewValue: 'deepseek-r1:14b (<12GB)', thinking: true, memory: 9, description: ''}    
  ];
  embedding_models: any[] = [
    {value: 'embeddinggemma:300m', viewValue: 'embeddinggemma:300m (<1GB)', thinking: false, memory: 1, description: 'EmbeddingGemma is a 300M parameter embedding model from Google'},
    {value: 'nomic-embed-text:v1.5', viewValue: 'nomic-embed-text:v1.5 (<1GB)', thinking: false, memory: 1, description: 'A high-performing open embedding model with a large token context window'}
    /*
    {value: 'mxbai-embed-large:335m', viewValue: 'mxbai-embed-large:335m (<1GB)', thinking: false, memory: 1, description: ''},
    {value: 'bge-m3:567m', viewValue: 'bge-m3:567m (<1GB)', thinking: false, memory: 1, description: ''},
    {value: 'all-minilm:22m', viewValue: 'all-minilm:22m (<1GB)', thinking: false, memory: 1, description: ''},
    {value: 'bge-large:335m', viewValue: 'bge-large:335m (<1GB)', thinking: false, memory: 1, description: ''},
    {value: 'qwen3-embedding:0.6b', viewValue: 'qwen3-embedding:0.6b (<1GB)', thinking: false, memory: 1, description: ''}
    */
  ]
  modelsDownloaded: boolean = false;
  manageOllamaExternally: boolean = false;
  selectedModel: string = ''
  embeddings_model: string = '';
  downloadedLLM: string = '';
  
  gpuAcceleration: boolean = true;  
  serviceTimer: any;
    
  constructor(
    private commonService: CommonService
  ) {}

  getGpuAcceleration = async () => {
    const gpuAccelStr: string = await this.commonService.getEnvValue('GPU_ACCELERATION');    
    this.gpuAcceleration = gpuAccelStr.toLocaleLowerCase() === 'true' ? true : false;
    this.serviceName = 'ollama' + (this.gpuAcceleration ? '' : 'NoGPU');
    console.log('Ollama: getGPUAccel: Service Name:', this.serviceName);
  }

  getManagedExternally = async () => {
    const manageExternalStr: string = await this.commonService.getEnvValue('MANAGE_EXTERNAL');    
    this.manageOllamaExternally = manageExternalStr.toLocaleLowerCase() === 'true' ? true : false;
    console.log('Ollama: Manage External: Service Name:', this.serviceName);
  }

  setGpuAcceleration = async () => {
    this.status.update(EStatus.not_running);      
    await this.commonService.setEnvValue('GPU_ACCELERATION', this.gpuAcceleration ? 'true' : 'false')
    await this.commandOllama('gpuAccel', {
      gpuAcceleration: this.gpuAcceleration
    });
    this.serviceName = 'ollama' + (this.gpuAcceleration ? '' : 'NoGPU');
  }

  findProcess = async () => {
    const response: any = await this.commonService.findProcess(this.serviceName, 688);
    console.log('findProcess:', response);
    this.servicePID = response.servicePID;
  }

  fetchModelList = async () => {
    if (!this.modelsDownloaded) {
      let url: string = await this.commonService.getEnvValue('MODELS_FILE', 82)
      console.log('init:model file url:', url)            
      this.modelsDownloaded = true;
      this.models = await (await fetch(
        url,
        {
          method: 'GET',          
        }
      )).json();

      url = await this.commonService.getEnvValue('EMBEDDED_MODELS_FILE', 83)
      console.log('init:embedded file url:', url)
      this.embedding_models = await (await fetch(
        url,
        {
          method: 'GET',          
        }
      )).json();
      console.log('models downloaded!');
    }
  }

  getThinkingForModel = (model: string): boolean => {
    const idx = this.models.findIndex(m => m.value === model);
    if (idx > -1) {
      return this.models[idx].thinking;
    } else {
      return false;
    }
  }

  commandOllama = (command: string, options: any = {}): Promise<any> => {
    return this.commonService.commandService(93, this.serviceName, command, options);
  }

  start = async (): Promise<any> => {
    console.log('ollama:service:start Ollama:', this.serviceName);
    await this.findProcess();
    if (this.servicePID === -1) {
      this.status.update(EStatus.starting);
      return this.commonService.commandService(
        93,
        this.serviceName,
        'start',
        {
          gpuAccel: this.gpuAcceleration
        }
      );
    } else {
      console.log('ollama:service:start not called, already running:', this.servicePID);
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

  getAvailableLLMs = async (): Promise<void> => {
    // const currentModels: any[] = this.availableModels;
    const value: any = await this.commandOllama('list');
    // console.log('getAvailableLLMs:', value.models);
    if (value && value.models) {
      this.availableModels = value.models.map((model: any) => {
        const mm: any = this.models.find(f => f.value === model.name);
        const em: any = this.embedding_models.find(f => f.value === model.name);
        return {
          name: model.name,
          size: Math.floor(model.size / 1024 / 1000),
          usage: model.usage,
          description: mm ? mm.description : em ? em.description : ''
        }
      });
    }
    // console.log('getAvailableLLMs:', this.availableModels);
  }

  checkIsReady = async () => {
    const { isReady } = await this.commonService.commandService(93, this.serviceName, 'isReady');
    if (!isReady) {
      console.log('setOllamaCheckTimer:failed:set status not_running')
      this.status.update(EStatus.not_running);            
    } else {
      this.status.update(EStatus.running);
      if (this.serviceTimer) {
        clearInterval(this.serviceTimer);
      }      
    }
  }

  setOllamaCheckTimer = () => {
    if (this.serviceTimer) {
      clearInterval(this.serviceTimer);
    }
    this.serviceTimer = setInterval(async () => {
      await this.checkIsReady();
    }, 10000);
  }  

  startServicesIfNecessary = async (mecb: () => void = () => {}) => {    
    // Check if ollama is running
    console.log('startServicesIfNecessary:ollama');
    if (this.manageOllamaExternally === true) {
      const { isReady } = await this.commandOllama('isReady');
      console.log('ollama check RUNNING:', isReady, this.manageOllamaExternally);
      if (isReady === false) {    
        this.setOllamaCheckTimer();
        console.log('SHOWING OLLAMA MANUAL WARNING:', this.manageOllamaExternally);
        mecb();
      }
    }
  }

  startOnTimer = async (mecb: () => void = () => {}) => {
    console.log('ollama:calling start!');
    await this.start();
    // this.status.update(EStatus.running);
    this.setOllamaCheckTimer();
    if (this.manageOllamaExternally === true) {
      mecb();
    }
  }
  
  pull = (model: string): Promise<any> => {
    if (this.availableModels.findIndex(f => f.name === model) === -1) {
      console.log('pull:', model);
      return this.commandOllama('pull', { model, stream: true});
    }
    return Promise.resolve('pulled');
  }
}

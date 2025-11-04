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

  findProcess = async () => {
    const response: any = await this.commonService.findProcess(this.serviceName);
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
    await this.findProcess();
    if (this.servicePID === -1) {
      return this.commonService.commandService(
        93,
        this.serviceName,
        'start',
        {
          gpuAccel: this.gpuAcceleration
        }
      );
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
        return {
          name: model.name,
          size: Math.floor(model.size / 1024 / 1000),
          usage: model.usage
        }
      });
    }
    // console.log('getAvailableLLMs:', this.availableModels);
  }

  setOllamaCheckTimer = (cb = () => {}) => {
    if (this.serviceTimer) {
      clearInterval(this.serviceTimer);
    }
    this.serviceTimer = setInterval(async () => {
      await cb();
      const { isReady } = await this.commonService.commandService(93, this.serviceName, 'isReady');
      if (!isReady) {
        clearInterval(this.serviceTimer);
        this.status.update(EStatus.not_running);            
      } else {
        this.status.update(EStatus.running);
      }
    }, 10000);
  }  

  startServicesIfNecessary = async (mecb: () => void = () => {}) => {    
    // Check if ollama is running
    console.log('startServicesIfNecessary:');
    const { isReady } = await this.commandOllama('isReady');
    console.log('ollama check RUNNING:', isReady, this.manageOllamaExternally);
    if (isReady === true) {
      if (this.manageOllamaExternally === true) {
        this.setOllamaCheckTimer();
      } else {
        this.status.update(EStatus.running);
      }
    } else {
      if (this.manageOllamaExternally === true) {        
        console.log('SHOWING OLLAMA MANUAL WARNING:', this.manageOllamaExternally);
        mecb();        
      } else {
        await this.start();
        this.status.update(EStatus.running);
        this.setOllamaCheckTimer();
        /*
        if (response && response.status === 'error' && response.error === 'extraction') {
          this.status.update(EStatus.extracting);
          console.log('waiting for extraction to complete, then start...');
        } else {
          this.status.update(EStatus.running);
          this.setOllamaCheckTimer();
        }
      */
      }
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

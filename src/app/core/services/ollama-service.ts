import { Injectable } from '@angular/core';
import { CommonService, LStatus } from './common-service';
import { EStatus } from '../../shared/model';
import { SettingsService } from './settings-service';

@Injectable({
  providedIn: 'root'
})
export class OllamaService { 
  serviceName: string = 'ollama';
  status: LStatus = new LStatus(EStatus.not_running);
  servicePID: number = -1;
  apiKey: string = '';
  cloudSelected: boolean = false;
  useDocContext: boolean = false;
  
  availableModels: any[] = [];
  models: any[] = [
    {value: 'gemma3:1b', viewValue: 'gemma3:1b (<1GB)', thinking: false, cloud: false, memory: 1, description: ''},    
  ];
  embedding_models: any[] = [    
    {value: 'embeddinggemma:300m', viewValue: 'embeddinggemma:300m (<1GB)', thinking: false, cloud: false, memory: 1, description: 'EmbeddingGemma is a 300M parameter embedding model from Google'},    
  ]
  ocr_models: any[] = [
    {value: 'qwen3-vl:4b', viewValue: 'qwen3-vl:4b (4GB)', thinking: false, cloud: false, memory: 4, description: 'Qwen-VL is a vision-language model by AI21 Labs that can understand and generate text based on image inputs.', prompt: 'Perform Optical Character Recognition (OCR) on the provided image and format all extracted text as a clear, structured Markdown document. Include tables as markdown tables, lists as markdown lists, etc.'},
    {value: 'deepseek-ocr', viewValue: 'deepseek-ocr (8GB)', thinking: false, cloud: false, memory: 8, description: 'DeepSeek OCR is an advanced optical character recognition model designed to extract text from images with high accuracy.', prompt: '<|grounding|>Convert the document to markdown.'}
  ];
  
  modelsDownloaded: boolean = false;
  manageOllamaExternally: boolean = false;
  selectedModel: string = ''
  embeddings_model: string = '';
  downloadedLLM: string = '';
  downloadedEmbeddedLLM: string = '';
  ocr_model: string = '';
  downloadedOCRLLM: string = '';
  
  gpuAcceleration: boolean = true;  
  serviceTimer: any;
    
  constructor(
    private commonService: CommonService,
    private settingsService: SettingsService
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
      let url: string = await this.commonService.getEnvValue('MODELS_FILE' + (this.settingsService.isActivePro() ? '_PRO' : ''), 82)
      console.log('init:model file url:', url)            
      this.modelsDownloaded = true;
      this.models = await (await fetch(
        url,
        {
          method: 'GET',          
        }
      )).json();

      url = await this.commonService.getEnvValue('EMBEDDED_MODELS_FILE' + (this.settingsService.isActivePro() ? '_PRO' : ''), 83)
      console.log('init:embedded file url:', url)
      this.embedding_models = await (await fetch(
        url,
        {
          method: 'GET',          
        }
      )).json();
      console.log('models downloaded!');
      this.getAvailableLLMs();
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

  isCloud = (): boolean => {
    return this.models.find(m => m.value === this.selectedModel).cloud;    
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
          cloud: mm ? mm.cloud : false,
          description: mm ? mm.description : em ? em.description : '',
          viewValue: mm ? mm.viewValue : em ? em.viewValue : model.name,
          modelType: mm ? 'llm' : em ? 'embedding' : 'unknown'
        }
      });
    }
    console.log('getAvailableLLMs:', this.availableModels);
  }

  filteredAvailableModels = (): any[] => {
    return this.availableModels.filter(v => (v.modelType === 'llm'));
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

  delete = (index: number): Promise<any> => {
    const model: string = this.availableModels[index].name;
    console.log('delete:', model);
    return this.commandOllama('rm', { model }).then(() => {
      this.availableModels.splice(index, 1);
    })    
  }  
}

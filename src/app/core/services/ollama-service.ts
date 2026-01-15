import { Injectable } from '@angular/core';
import { CommonService, LStatus } from './common-service';
import { EStatus, IChat } from '../../shared/model';
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
  useTesseractJS: boolean = true;
  chatHistory: IChat[] = [];
  
  availableModels: any[] = [];
  models: any[] = [
    {
      "value": "gemma3:1b",
      "viewValue": "gemma3:1b - tiny, fast, sacrifices accuracy (<1GB)",
      "thinking": false,
      "cloud": false,
      "memory": 1,
      "input": "Text",
      "description": "The current, most capable model that runs on a single GPU"
    },
    {
      "value": "granite3-dense:2b",
      "viewValue": "granite3-dense:2b - small, fast, trade off accuracy (<2GB)",
      "thinking": true,
      "cloud": false,
      "memory": 2,
      "input": "Text",
      "description": "The IBM Granite 2B and 8B models are designed to support tool-based use cases and support for retrieval augmented generation (RAG), streamlining code generation, translation and bug fixing"
    },
    {
      "value": "llama3-chatqa:8b",
      "viewValue": "llama3-chatqa:8b - focus on Rag queries (<5GB)",
      "thinking": true,
      "cloud": false,
      "memory": 5,
      "input": "Text",
      "description": "A model from NVIDIA based on Llama 3 that excels at conversational question answering (QA) and retrieval-augmented generation (RAG)"
    },
    {
      "value": "deepseek-r1:14b",
      "viewValue": "deepseek-r1:14b - Reasoning model with great performance (<12GB)",
      "thinking": true,
      "cloud": false,
      "memory": 9,
      "input": "Text",
      "description": "DeepSeek-R1 is a family of open reasoning models with performance approaching that of leading models, such as O3 and Gemini 2.5 Pro"
    },
    {
      "value": "deepseek-r1:32b",
      "viewValue": "deepseek-r1:32b - Reasoning model, performance and accuracy (<22GB)",
      "thinking": true,
      "cloud": false,
      "memory": 32,
      "input": "Text",
      "description": "DeepSeek-R1 is a family of open reasoning models with performance approaching that of leading models, such as O3 and Gemini 2.5 Pro"
    }
  ];
  embedding_models: any[] = [    
    {value: 'embeddinggemma:300m', viewValue: 'embeddinggemma:300m (<1GB)', thinking: false, cloud: false, memory: 1, "input": "Text",description: 'EmbeddingGemma is a 300M parameter embedding model from Google'},    
  ]
  ocr_models: any[] = [
    { value: 'deepseek-ocr:latest', viewValue: 'deepseek-ocr (<8GB)', thinking: false, cloud: false, memory: 8, "input": "Text,Image", description: 'DeepSeek OCR is an advanced optical character recognition model designed to extract text from images with high accuracy.',
      prompt: '<|grounding|>Convert the document to markdown.',
      params: {
        "temperature": 0
      }
    },
    { value: 'benhaotang/Nanonets-OCR-s:latest', viewValue: 'nanonets-OCR-s (<5GB)', thinking: false, cloud: false, memory: 5, "input": "Text,Image", description: 'Nanonets OCR is a cloud-based optical character recognition model that provides accurate text extraction from images.',
      prompt: 'Perform Optical Character Recognition (OCR) on the provided image and format all extracted text as a clear, structured Markdown document. Include tables as markdown tables, lists as markdown lists, etc.',
      params: {}
    },
    { value: 'gemma3:4b', viewValue: 'gemma3.4b (<4GB)', thinking: false, cloud: false, memory: 6, "input": "Text,Image", description: 'The current, most capable model that runs on a single GPU.',
      // prompt: 'Convert the image to markdown.',
      prompt: 'Analyze the text in the provided image. Extract all readable content and present it in a structured Markdown format that is clear, concise, and well-organized.',
      params: {
        "temperature": 0.1,
        "top_p": 0.9,
        "num_ctx": 128000
      }
    },
    { value: 'granite3.2-vision:latest', viewValue: 'granite3.2-vision (<3GB)', thinking: false, cloud: false, memory: 5, "input": "Text,Image",description: 'A compact and efficient vision-language model, specifically designed for visual document understanding, enabling automated content extraction from tables, charts, infographics, plots, diagrams, and more. ',
      prompt: 'Analyze the text in the provided image. Extract all readable content and present it in a structured Markdown format that is clear, concise, and well-organized.',
      // prompt: 'Convert the image to markdown.',
      params: {
        "temperature": 0,
        "num_ctx": 16384
      } 
    }    
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

  resetChatHistory = () => {
    this.chatHistory = [];    
  }

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

  commandOllama = (command: string, options: any = {}, index: number = 93): Promise<any> => {
    return this.commonService.commandService(index, this.serviceName, command, options);
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

  stop = (): Promise<any> => {
    this.status.update(EStatus.destroy);
    return this.commonService.commandService(
      94,
      this.serviceName,
      'stop',
      {
        mode: 1
      }
    );
  }

  restart = async (ev: any) => {
    await this.stop();    
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
          modelType: mm ? 'llm' : em ? 'embedding' : 'unknown',
          input: mm ? mm.input : em ? em.input : 'Text',
          thinking: mm ? mm.thinking : em ? em.thinking : false          
        }
      });
    }
    // console.log('getAvailableLLMs:', this.availableModels);
  }

  getModelByName = (modelName: string): any => {
    return this.availableModels.find(m => m.name === modelName);
  }

  getContextLength = (modelName: string): number => {
    const modelEntry: any = this.availableModels.find(m => m.name === modelName);
    if (modelEntry && modelEntry.context_length) {
      return modelEntry.context_length;
    } else {
      return 2048; // Default
    }
  }

  getAllModelDetails = (): any => {
    this.availableModels.forEach((modelEntry: any, index: number) => {
      this.show(modelEntry.name, index).then((modelDetails: any) => {
        this.availableModels[index].model_info = modelDetails.model_info;
        const archName: string = modelDetails.model_info["general.architecture"];
        try {
          this.availableModels[index].context_length = Number(modelDetails.model_info[archName + '.context_length']);
        } catch (ne) {
          console.error(ne);
          this.availableModels[index].context_length = 4096;
        }
        this.models.find((m: any) => m.value === modelEntry.name).context_length = this.availableModels[index].context_length;
        // console.log('getAllModelDetails:model_info:', modelEntry.name, modelDetails.model_info);
      }
    )});
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
    let cnt = 0;
    this.serviceTimer = setInterval(async () => {
      await this.checkIsReady();
      cnt++;
      if (cnt >= 6) {
        clearInterval(this.serviceTimer);
        // Warning have you installed ollama?
        console.log('setOllamaCheckTimer:timeout:set status not_running')
        this.status.update(EStatus.not_installed);
      }
    }, 5000);
  }  

  startServicesIfNecessary = async (osType: any, mecb: () => void = () => {}) => {    
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
    } else {
      this.setOllamaCheckTimer();
    }
    /*
    else if (osType && osType.isMac === true) {
      console.log('startServicesIfNecessary:ollama:mac - starting on timer');
      const { isReady } = await this.commandOllama('isReady');
      if (isReady === false) {    
        // Attempt to start ollama
        await this.startOnTimer(mecb);        
      }
    }
    */
  }

  startOnTimer = async (mecb: () => void = () => {}) => {
    console.log('ollama:calling start on timer!');
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

  show = (model: string, index: number): Promise<any> => {
    return this.commandOllama('show', { model }, 967 + index);    
  }

  delete = (index: number): Promise<any> => {
    const model: string = this.availableModels[index].name;
    console.log('delete:', model);
    return this.commandOllama('rm', { model }).then(() => {
      this.availableModels.splice(index, 1);
    })    
  }  
}

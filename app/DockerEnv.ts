import { ipcMain } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { KeyValueFile, parseFile } from 'key-value-file'
import log from 'electron-log/main';

const mergeKeys: string[] = [
  "VERSION",
  "MANAGE_EXTERNAL",
  "GPU_ACCELERATION",
  "OLLAMA_VERSION",
  "IPEX_VERSION",
  "RERANKER_VERSION",
  "USE_WATCHER",
  "USE_TESSERACTJS",
  "ACCEPT_PP",
  "ACCEPT_EUA",
  "ACCEPT_SECURITY",
  "LC_PP",
  "LC_EUA",
  "LC_SECURITY",
  "QUANTUM_ENC"
];

const overwriteKeys: string[] = [
  "YOUTUBE_GALLERY_URL",
  "TOOLS_DLS_FILE",
  "RERANK_SERVICE",
  "REMOTE_LLM_SERVICE",
  "UPDATE_INFO_FILE",
  "MODELS_FILE",
  "EMBEDDED_MODELS_FILE",
  "MODELS_FILE_PRO",
  "EMBEDDED_MODELS_FILE_PRO",
  "LIBRARY_PREFIX",
  "TICKET_URL",
  "FORUM_URL",
  "REGISTRATION_URL",
  "KB_URL",
  "PRIVACY_POLICY_URL",
  "EUA_URL",
  "SECURITY_URL",
  "LICENSE_GET_URL",
  "LICENSE_ACTIVATE_URL",
  "OLLAMA_KEYS_URL",
  "FEEDBACK_URL"
];

export default class DockerEnv {
  appConfigPath: string;
  assetsFolderPath: string;
  userHomePath: string;
  userDataPath: string;
  userTempPath: string;
  sep: string;
  dsp: string | undefined;
  ellm: string | undefined;
  llm: string | undefined;
  ocrllm: string | undefined;
  sourceEnvPath: string;
  kvFile: KeyValueFile | undefined;
  docPathsCB: (licenseKey: string | undefined, docPath: string | undefined, dataPath: string | undefined) => void;

  constructor(appConfigPath: string, assetsFolderPath: string, userHomePath: string, userDataPath: string, userTempPath: string, sep: string, docPathsCB: (licenseKey: string | undefined, docPath: string | undefined, dataPath: string | undefined) => void) {    
    this.appConfigPath = appConfigPath;
    this.assetsFolderPath = assetsFolderPath;
    this.userHomePath = userHomePath;
    this.userDataPath = sep === '\\' ? userDataPath.replace(new RegExp('\\\\','g'), '\\\\') : userDataPath;
    this.userTempPath = sep === '\\' ? userTempPath.replace(new RegExp('\\\\','g'), '\\\\') : userTempPath;
    this.sep = sep === '\\' ? '\\\\' : sep;
    this.docPathsCB = docPathsCB;
    if (!fs.existsSync(this.appConfigPath)) {
      fs.mkdirSync(this.appConfigPath, { recursive: true });
    }
    this.sourceEnvPath = path.join(appConfigPath, '.env');
    // Read the .env and set dsp, ellm, llm
    log.info('DockerEnv:constructor:read:', this.sourceEnvPath)
  }

  init = async () => {
    await parseFile(this.sourceEnvPath).then(async (kv: KeyValueFile) => {
      const dp: string | undefined = kv.get('ROOT_DATA_PATH')?.toString();
      this.dsp = kv.get('DOC_SOURCE_PATH')?.toString();      
      this.ellm = kv.get('EMBEDDINGS_MODEL_NAME')?.toString();
      this.llm = kv.get('LLM_MODEL_NAME')?.toString();
      this.ocrllm = kv.get('OCR_MODEL_NAME')?.toString();
      this.kvFile = kv;
      await this.mergeEnvFile();
      await this.overwriteEnvFile();
      await this.docPathsCB(kv.get('LICENSE_KEY')?.toString(), this.dsp, dp);
    }).catch(async (reason: any) => {
      this.dsp = path.join(this.userHomePath, 'lrag').replace(new RegExp('\\\\','g'), '\\\\');
      this.ellm = "embeddinggemma:300m";
      this.llm = "gemma3:1b";
      this.ocrllm = "deepseek-ocr:latest";            
      // this.ocrllm = "gemma3:4b";
      // this.ocrllm = "benhaotang/Nanonets-OCR-s:latest";
      // this.ocrllm = "granite3.2-vision:latest";
      this.generateEnvFile();
      this.kvFile = await parseFile(this.sourceEnvPath);
      const dp: string | undefined = this.kvFile.get('ROOT_DATA_PATH')?.toString();
      this.dsp = this.kvFile.get('DOC_SOURCE_PATH')?.toString();      
      await this.docPathsCB(this.kvFile.get('LICENSE_KEY')?.toString(), this.dsp, dp);
    });
  }

  register = () => {
    ipcMain.on('env', async (event: any, arg: any) => {
      const { callbackId, command, params }= arg;
      log.info('env:', callbackId, command, params)
      let response: any = {}
      switch (command) {
        case "get": {
          response = await this.kvFile?.get(params.key)?.toString();
        }
        break;
        case "set": {
          await this.kvFile?.set(params.key, params.value);
          response = await this.kvFile?.writeFile();
        }
        break;
        case "write": {
          response = await this.kvFile?.writeFile();
        }
        break;
      }
      event.reply('reply', {
        callbackId,
        response: JSON.stringify(response)
      })
    }) 
  }
  
  setDocSourcePath = (dsp: string) => {
    this.dsp = dsp;    
    this.generateEnvFile();
  }

  setEmbeddingsModelName = (ellm: string) => {
    this.ellm = ellm;
    this.generateEnvFile();
  }

  setModelName= (llm: string) => {
    this.llm = llm;
    this.generateEnvFile();
  }

  setOCRModelName= (ocrllm: string) => {
    this.ocrllm = ocrllm;
    this.generateEnvFile();
  }

  forceTesseractJS = async () => {
    await this.kvFile?.set('USE_TESSERACTJS', 'true');
    await this.kvFile?.writeFile();
  }

  getDocSourcePath = (): string => {
    return this.dsp ? this.dsp : this.userDataPath;
  }

  getEmbeddingsModelName = (): string | undefined => {
    return this.ellm;
  }

  getModelName = (): string => {
    return this.llm ? this.llm : 'gemma3:1b';
  }

  getKeyValue = (key: string): string | undefined => {
    return this.kvFile ? this.kvFile.get(key)?.toString().replace(/\r$/,'') : undefined;
  }

  generateEnvFile = (): Promise<string> => {
    let envTemplate: string = fs.readFileSync(path.join(this.assetsFolderPath, 'template.env'), 'utf8');
    envTemplate = envTemplate.replace(new RegExp('#DOC_ROOT_PATH#','g'), this.dsp ? this.dsp : '');
    envTemplate = envTemplate.replace(new RegExp('#EMBEDDINGS_MODEL_NAME#','g'), this.ellm ? this.ellm : '');
    envTemplate = envTemplate.replace(new RegExp('#LLM_MODEL_NAME#','g'), this.llm ? this.llm : '');
    envTemplate = envTemplate.replace(new RegExp('#OCR_MODEL_NAME#','g'), this.ocrllm ? this.ocrllm : '');
    envTemplate = envTemplate.replace(new RegExp('#TEMP#','g'), this.userTempPath);
    envTemplate = envTemplate.replace(new RegExp('#USER_DATA_HOME#','g'), this.userDataPath);
    envTemplate = envTemplate.replace(new RegExp('#SEP#','g'), this.sep);    
    return this.writeEnvFile(envTemplate).then((kvFile: KeyValueFile) => {
      this.kvFile = kvFile;
      return envTemplate;  
    })    
  }

  mergeEnvFile = async (): Promise<boolean> => {
    return new Promise(async (resolve) => {
      const envTemplateKv: KeyValueFile = await parseFile(path.join(this.assetsFolderPath, 'template.env'));
      for await (const key of mergeKeys) {
        const value: string | undefined = await envTemplateKv.get(key)
        if (value) {
          const curVal: string | undefined = this.kvFile?.get(key);
          if (curVal) {
            log.info('mergeEnvFile:cur:', key, curVal);          
          } else {
            log.info('mergeEnvFile:new:', key, value);
            this.kvFile?.set(key, value);
          }
        }
      }    
      await this.kvFile?.writeFile();
      resolve(true);
    })    
  }

  overwriteEnvFile = async (): Promise<boolean> => {
    return new Promise(async (resolve) => {
      const envTemplateKv: KeyValueFile = await parseFile(path.join(this.assetsFolderPath, 'template.env'));
      for await (const key of overwriteKeys) {
        const value: string | undefined = await envTemplateKv.get(key)
        if (value) {
          log.info('overwriteEnvFile:new:', key, value);
          this.kvFile?.set(key, value);        
        }
      }    
      await this.kvFile?.writeFile();
      resolve(true);
    })    
  }

  writeEnvFile = (data: string): Promise<KeyValueFile> => {
    fs.writeFileSync(this.sourceEnvPath, data);
    return parseFile(this.sourceEnvPath);
  }
}
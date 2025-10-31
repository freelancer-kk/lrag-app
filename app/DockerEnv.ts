import { ipcMain } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { KeyValueFile, parseFile } from 'key-value-file'

const mergeKeys: string[] = [
  "RERANK_SERVICE",
  "REMOTE_LLM_SERVICE",
  "OCR_SFTP_HOST",
  "OCR_SFTP_PORT",
  "OCR_USER",
  "OCR_PASSWD",
  "UPDATE_INFO_FILE",
  "MODELS_FILE",
  "LIBRARY_PREFIX",
  "VERSION",
  "TOOLS_DLS_FILE",
  "OLLAMA_VERSION",
  "IPEX_VERSION",
  "MANAGE_EXTERNAL",
  "GHOSTSCRIPT_VERSION",
  "RERANKER_VERSION",
  "WATCHER_VERSION"
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
  sourceEnvPath: string;
  kvFile: KeyValueFile | undefined;
  docPathsCB: (docPath: string | undefined, dataPath: string | undefined) => void;

  constructor(appConfigPath: string, assetsFolderPath: string, userHomePath: string, userDataPath: string, userTempPath: string, sep: string, docPathsCB: (docPath: string | undefined, dataPath: string | undefined) => void) {    
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
    console.log('DockerEnv:constructor:read:', this.sourceEnvPath)
  }

  init = async () => {
    await parseFile(this.sourceEnvPath).then(async (kv: KeyValueFile) => {
      const dp: string | undefined = kv.get('ROOT_DATA_PATH')?.toString();
      this.dsp = kv.get('DOC_SOURCE_PATH')?.toString();      
      this.ellm = kv.get('EMBEDDINGS_MODEL_NAME')?.toString();
      this.llm = kv.get('LLM_MODEL_NAME')?.toString();
      this.kvFile = kv;
      await this.mergeEnvFile();
      await this.docPathsCB(this.dsp, dp);
    }).catch(async (reason: any) => {
      this.dsp = path.join(this.userHomePath, 'lrag').replace(new RegExp('\\\\','g'), '\\\\');
      this.ellm = "embeddinggemma:300m";
      this.llm = "gemma3:1b";
      this.generateEnvFile();
      this.kvFile = await parseFile(this.sourceEnvPath);
      const dp: string | undefined = this.kvFile.get('ROOT_DATA_PATH')?.toString();
      this.dsp = this.kvFile.get('DOC_SOURCE_PATH')?.toString();      
      await this.docPathsCB(this.dsp, dp);
    });
  }

  register = () => {
    ipcMain.on('env', async (event: any, arg: any) => {
      const { callbackId, command, params }= arg;
      console.log('env:', callbackId, command, params)
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
    return this.kvFile ? this.kvFile.get(key)?.toString() : undefined;
  }
  
  generateEnvFile = (): Promise<string> => {
    let envTemplate: string = fs.readFileSync(path.join(this.assetsFolderPath, 'template.env'), 'utf8');
    envTemplate = envTemplate.replace(new RegExp('#DOC_ROOT_PATH#','g'), this.dsp ? this.dsp : '');
    envTemplate = envTemplate.replace(new RegExp('#EMBEDDINGS_MODEL_NAME#','g'), this.ellm ? this.ellm : '');
    envTemplate = envTemplate.replace(new RegExp('#LLM_MODEL_NAME#','g'), this.llm ? this.llm : '');
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
            console.log('mergeEnvFile:cur:', key, curVal);          
          } else {
            console.log('mergeEnvFile:new:', key, value);
            this.kvFile?.set(key, value);
          }
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
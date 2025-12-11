import { ipcMain } from 'electron';
import { TextLoader } from "@langchain/classic/document_loaders/fs/text";
import { JSONLoader, JSONLinesLoader } from "@langchain/classic/document_loaders/fs/json";

import { CSVLoader } from "@langchain/community/document_loaders/fs/csv";
import { PDFLoader } from "@langchain/community/document_loaders/fs/pdf";
import { PPTXLoader } from "@langchain/community/document_loaders/fs/pptx";
import { DocxLoader } from "@langchain/community/document_loaders/fs/docx";
import { RecursiveCharacterTextSplitter, RecursiveCharacterTextSplitterParams } from "@langchain/textsplitters";
import { OllamaEmbeddings } from "@langchain/ollama";
import { Document } from "@langchain/core/documents";
import { mkdirSync } from 'fs';
import * as path from 'path';
import { HNSWLib } from "@langchain/community/vectorstores/hnswlib";
import SemanticChunking, { LanguageTypes } from './SemanticChunking';
import * as fs from 'fs';
import OCRJSProcessor from './OCRJSProcessor';
import { v4 as uuidv4 } from 'uuid';
import log from 'electron-log/main';
import OCRllmProcessor from './OCRllmProcessor';
import Quantum from './Quantum';

export enum EVectorStoreType {
  HNSWLib,
}

export default class LangchainService {
  doc_path: string;
  root_doc_path: string;
  db_path: string;
  embeddings: OllamaEmbeddings;
  vectorStore: HNSWLib | undefined;
  webContents: Electron.WebContents | undefined;
  hasAddedDocs = false;
  numOfDocs: number = 0;
  semanticChunking: SemanticChunking;
  vectorStoreType: EVectorStoreType | undefined;
  ocrJSProcessor: OCRJSProcessor | undefined;
  ocrLLMProcessor: OCRllmProcessor;
  quantum: Quantum;
  uuid: string;
  baseUrl: string;

  constructor(
    doc_path: string,
    db_dir: string,
    ocrJSProcessor: OCRJSProcessor | undefined,
    ocrLLMProcessor: OCRllmProcessor,
    quantum: Quantum,
    baseUrl: string = "http://localhost:11434",
    model: string = "embeddinggemma:300m"
) {
    this.doc_path = doc_path;
    this.root_doc_path = doc_path;
    mkdirSync(path.join(db_dir, 'hnsw'), { recursive: true });
    this.db_path = path.join(db_dir, 'hnsw');    
    
    log.info('db_path:', this.db_path);
    log.info('doc_path:', this.doc_path);    

    this.embeddings = new OllamaEmbeddings({
        model,
        baseUrl
    });
    this.baseUrl = baseUrl;
    
    this.semanticChunking = new SemanticChunking(baseUrl, model);

    this.ocrJSProcessor = ocrJSProcessor;
    this.ocrLLMProcessor = ocrLLMProcessor;
    this.quantum = quantum;
          
    this.uuid = uuidv4();

    log.info('LangchainService initialized');        
  }

  register = (webContents: Electron.WebContents | undefined) => {
    this.webContents = webContents;
    this.semanticChunking.register(webContents);
    this.ocrJSProcessor?.register(webContents);
    this.ocrLLMProcessor.register(webContents);
    ipcMain.on('ingest', async (event: any, arg: any) => {
      const { callbackId, command, params }= arg;
      log.info('LangchainService:', callbackId, command, params)
      let response: any = {}
      switch (command) {
        case "start": {
          this.doc_path = path.join(this.root_doc_path, params.collection);
          response = await this.run(params);          
        }
        break;
        case "load": {
          response = await this.loadVectorStore(EVectorStoreType.HNSWLib, params.collection);
        }
        break;
        case "save": {
          response = await this.saveVectorStore(EVectorStoreType.HNSWLib, params.collection);
        }
        break;
        case "delete": {
          response = await this.deleteVectorStore(EVectorStoreType.HNSWLib, params.collection);
        }
        break;        
        case "reset": {
          response = await this.resetVectorStore(params.collection);
        }
        break;
        case "indexed": {
          response = await this.isDocumentIndexed(EVectorStoreType.HNSWLib, params.source);
        }
        break;
      }
      event.reply('reply', {
        callbackId,
        response: JSON.stringify(response)
      })
    }) 
  }

  emit = (args: any) => {
    this.webContents?.send('event', {
      response: args
    })                
  }

  isDocumentIndexed = async (vectorStoreType: EVectorStoreType, docSource: string): Promise<boolean> => {
    if (this.vectorStore) {
      try {
        const similaritySearchResults: Document[] = await this.vectorStore.similaritySearch(
          path.basename(docSource),
          1,
          (doc: Document) => doc.metadata.source === docSource,
        );
        return similaritySearchResults.length > 0;
      } catch (e) {
        log.error(e);
        return false;
      }
    }
    return false;
  }

  loadVectorStore = async (vectorStoreType: EVectorStoreType, collection: string): Promise<boolean | undefined> => {
    try {
      this.vectorStore = await HNSWLib.load(path.join(this.db_path, collection), this.embeddings,
        async (s: string) => {
          log.info('loadVectorStore:', s.length);
          try {
            return this.quantum.useEncryption ? await this.quantum.decrypt(s) : s;
          } catch (e) {
            log.error(e);
            return s;
          }
        }
      );        
      this.vectorStoreType = vectorStoreType;        
      this.hasAddedDocs = true;
      return true;
    } catch (e) {
      log.error(e);
      await this.resetVectorStore(collection);
      this.hasAddedDocs = true;
      return true;
    }  
  }

  saveVectorStore = async (vectorStoreType: EVectorStoreType, collection: string): Promise<boolean | undefined> => {
    if (this.vectorStore) {
      try {
        await (this.vectorStore as HNSWLib).save(path.join(this.db_path, collection),
        async (s: string) => { 
          try {
            return this.quantum.useEncryption ? await this.quantum.encrypt(s) : s;
          } catch (e) {
            log.error(e);
            return s;
          }
        });
        return true;
      } catch (e) {
        log.error(e);
        return false;
      }
    }
  }

  deleteVectorStore = async (vectorStoreType: EVectorStoreType, collection: string) => {
    if (this.vectorStore) {
      try {
        if (this.quantum.useEncryption) {
          // Delete associated encap files
          const dataFile: string = path.join(this.db_path, collection, 'docstore.json');
          await this.quantum.remove(fs.readFileSync(dataFile, 'utf-8'));
        }
        await (this.vectorStore as HNSWLib).delete({ directory: path.join(this.db_path, collection) });
      } catch (e) {
        log.error(e);
      }
    }
  }
  
  resetVectorStore = async (collection: string): Promise<boolean> => {
    this.vectorStore = undefined;
    this.vectorStoreType = EVectorStoreType.HNSWLib
    this.vectorStore = await HNSWLib.fromDocuments([], this.embeddings);
    await this.deleteVectorStore(this.vectorStoreType, collection);    
    return true;
  }

  addDocuments = async (docs: Document[]): Promise<void> => {    
    log.info('addDocuments:', docs.length);
    let i: number = 1;
    this.emit( { type: 'langchain-run-add-chunk', data: { chunk: 0, total: docs.length  } });
    let docBatch: Document[] = [];
    for await (const doc of docs) {
      docBatch.push(doc);
      if (i % 25 === 0) {
        await this.vectorStore?.addDocuments(docBatch);
        this.emit( { type: 'langchain-run-add-chunk', data: { chunk: i, total: docs.length  } });
        docBatch = [];
      }
      i++;
    }
    if (docBatch.length > 0) {
      await this.vectorStore?.addDocuments(docBatch);
      this.emit( { type: 'langchain-run-add-chunk', data: { chunk: i, total: docs.length  } });
    }
    // return this.vectorStore.addDocuments(docs);    

    const added_doc_names: string[] = [];
    for await (const ld of docs) {
      if (added_doc_names.findIndex(f => f === ld.metadata.source) === -1) {
        added_doc_names.push(ld.metadata.source);
        this.emit( { type: 'langchain-run-doc-added', data: { source: ld.metadata.source } });
      }
    }
  }

  setStatusForLoadedDocs = async (docs: Document[]): Promise<void> => {    
    log.info('set status:', docs.length);    
    const added_doc_names: string[] = [];
    for await (const ld of docs) {
      if (added_doc_names.findIndex(f => f === ld.metadata.source) === -1) {
        added_doc_names.push(ld.metadata.source);
        this.emit( { type: 'langchain-run-doc-added', data: { source: ld.metadata.source } });
      }
    }
  }
  
  getSearchableVectorStore = (): HNSWLib | undefined => {
    return this.vectorStore;
  }

  load = async (params: any): Promise<Document[]> => {
    const dirEnts: fs.Dirent[] = fs.readdirSync(this.doc_path, { withFileTypes: true });
    const loaders: any[] = [];
    for await (const dirent of dirEnts) {
      const fullpath: string = path.join(dirent.parentPath, dirent.name);
      try {
        if (dirent.isFile()) {
          log.info('langchain:load:', fullpath);
          // const fileBuffer = fs.readFileSync(fullpath);
          // const blob: Blob = new Blob([fileBuffer]);        
          switch(path.extname(dirent.name)) {
            case ".json": {
              loaders.push({ fullpath, loader: new JSONLoader(fullpath, "/texts")})
            }
            break;
            case ".jsonl": {
              loaders.push({ fullpath, loader: new JSONLinesLoader(fullpath, "/html")})
            }
            break;
            case ".txt": 
            case ".md":
            case ".xml": {
              loaders.push({ fullpath, loader: new TextLoader(fullpath)})
            }
            break;
            case ".csv": {
              loaders.push({ fullpath, loader: new CSVLoader(fullpath, {
                separator: params.separator
              })})
            }
            break;
            case ".xls":
            case ".xlsm": {
              loaders.push({ fullpath, loader: new CSVLoader(fullpath)})
            }
            break;
            case ".pdf": {
              loaders.push({ fullpath, loader: new PDFLoader(fullpath, {
                splitPages: true,
                parsedItemSeparator: ""  
              })})
            }
            break;
            case ".pptx":
            case ".ppt": {
              loaders.push({ fullpath, loader: new PPTXLoader(fullpath)})
            }
            break;
            case ".docx":
            case ".doc": {
              loaders.push({ fullpath, loader: new DocxLoader(fullpath)})
            }
            break;          
            default: {
              log.info('langchain:load:ignoring:file:', dirent.name);    
            }
          }          
        } else {
          log.info('langchain:load:ignoring:entry:', dirent.name);
        }        
      } catch (fe) {
        log.error(fe);
        fs.writeFileSync(fullpath, '', 'utf-8');
        this.emit( { type: 'langchain-run-doc-error', data: { source: path.basename(fullpath), error: JSON.stringify(fe) } });
      }
    }
    
    let docs: Document[] = [];
    log.info('langchain:loaders:', loaders.length);
    for await (const ll of loaders) {
      await ll.loader.load().then((ldocs: Document[]) => {
        docs = docs.concat(ldocs).map((d: Document) => {
          d.metadata.source = ll.fullpath;
          fs.writeFileSync(ll.fullpath, '', 'utf-8');
          return d;
        })
      }).catch((reason: any) => {
        log.error(reason);
        fs.writeFileSync(ll.fullpath, '', 'utf-8');
        this.emit( { type: 'langchain-run-doc-error', data: { source: path.basename(ll.fullpath), error: JSON.stringify(reason) } });
      }) 
    }
    
    const uniqueDocs: Document[] = docs.reduce(
      (acc: Document[], cur: Document) => (acc.findIndex(f => f.metadata.source === cur.metadata.source && f.pageContent === cur.pageContent) > -1 ? acc : [...acc, cur]),
      [],
    );
    log.info('langchain:loaded:', uniqueDocs.length);
    for await (const doc of uniqueDocs) {
      log.info(doc.metadata.source, '=>', doc.pageContent.substring(0, 20));
      this.emit( { type: 'langchain-run-doc', data: { id: doc.id, source: path.basename(doc.metadata.source), metadata: doc.metadata } });
    }
    return uniqueDocs;      
  }

  split = async (docs: Document[], params: Partial<RecursiveCharacterTextSplitterParams> | undefined, language: LanguageTypes | undefined = undefined ): Promise<Document[]> => {
    if (params && params.chunkSize && params.chunkOverlap && (params?.chunkSize > 0 || params?.chunkOverlap > 0)) {
      log.info('splitting:docs:', params, language, docs.length);
      
      let splitter: RecursiveCharacterTextSplitter;
      if (language) {
        splitter = RecursiveCharacterTextSplitter.fromLanguage(language, params);
      } else {
        splitter = new RecursiveCharacterTextSplitter(params);
      }
      const chunks: Document[] = await splitter.splitDocuments(docs);
      
      log.info('chunks:', chunks.length);
      return chunks;
    } else {
      return docs;
    }
  }

  semanticSplit = async (model: string, docs: Document[], params: Partial<RecursiveCharacterTextSplitterParams> | undefined, language: LanguageTypes | undefined = undefined ): Promise<Document[]> => {
    if (params && params.chunkSize && params.chunkOverlap && (params?.chunkSize > 0 || params?.chunkOverlap > 0)) {
      log.info('semantic:splitting:docs:', params, language, docs.length);
      
      let chunks: Document[] = [];
      let i = 1;
      for await (const doc of docs) {
        chunks = chunks.concat(await this.semanticChunking.chunk(model, doc, i, docs.length));
        i++;
      }
      
      log.info('semantic:chunks:', chunks.length);
      return chunks;  
    } else {
      return docs;
    }
  }
  
  OCRDocs = async (ocrobj: any, loaded_docs: Document[], doc_path: string, ocrProcessor: OCRllmProcessor | OCRJSProcessor): Promise<boolean> => {
    await this.ocrLLMProcessor.init(ocrobj);
    
    let hasOCRTasks: boolean = false;
    const file_names: string[] = fs.readdirSync(doc_path);
    const loaded_doc_names: string[] = [];
    for await (const ld of loaded_docs) {
      if (loaded_doc_names.findIndex(f => f === ld.metadata.source) === -1) {
        loaded_doc_names.push(ld.metadata.source);        
      }
    }

    for await (const fn of file_names) {
      if (loaded_doc_names.findIndex(ldn => path.basename(ldn) === fn) === -1) {
        const ts: number = fs.statSync(path.join(doc_path, fn)).size;
        // log.info('OCRDocs:check:', path.join(doc_path, fn), ts);        
        if ((fn.endsWith('pdf') || fn.endsWith('PDF')) && ts > 0) {
          // file has not been loaded convert to md
          log.info('OCR:convert:', path.join(doc_path, fn));
          ocrProcessor.put(path.join(doc_path, fn))           
          hasOCRTasks = true;                  
        } else {
          log.info('OCR ignoring non pdf:', fn);
          this.emit( { type: 'langchain-run-ocr-ignore', data: { name: fn } });
        }
      }
    }
    if (hasOCRTasks) {
      this.emit( { type: 'langchain-run-has-ocr', data: {} });
    }
    
    return hasOCRTasks;
  }

  run = async (params: any): Promise<any> => {
    this.emit( { type: 'langchain-run-start', data: {} } );
    return this.load(params).then(async (docs: Document[]) => {
      this.emit( { type: 'langchain-run-loaded', data: { documents: docs.length } });
      log.info('docs:length:', docs.length)
      let hasOCRTasks: boolean = false
      // Check for OCR
      if (this.ocrJSProcessor) {       
        hasOCRTasks = await this.OCRDocs(params.ocr, docs, this.doc_path, this.ocrJSProcessor);
      } else {
        hasOCRTasks = await this.OCRDocs(params.ocr, docs, this.doc_path, this.ocrLLMProcessor);
      }      
      if (!hasOCRTasks) {
        this.embeddings = new OllamaEmbeddings({
            model: params.embeddings,
            baseUrl: this.baseUrl
        });
        log.info('embeddings:', params.embeddings, this.baseUrl);
        await this.resetVectorStore(params.collection);          
        this.emit( { type: 'langchain-run-splitting', data: { documents: docs.length } });
        let chunks: Document[] = [];
        
        let sd: string = '';
        if (docs[0]) {
          sd = docs[0].metadata.source;
          log.info('first doc ends with:', sd);
        }
        if (sd.endsWith('md')) {
          chunks = await this.split(docs, params, 'markdown');
        } else {
          if (params.useSemantic) {
            chunks = await this.semanticSplit(params.embeddings, docs, params);
          } else {
            chunks = await this.split(docs, params);
          }
        }
        let uniqueNo: number = 0;
        this.numOfDocs = chunks.length;
        for await (const chunk of chunks) {
          chunk.id = String(uniqueNo++);
        }         
        this.emit( { type: 'langchain-run-split', data: { chunks: chunks.length } });
        if (chunks.length > 0) {        
          this.emit( { type: 'langchain-run-indexing', data: { chunks: chunks.length } });
          await this.addDocuments(chunks);
          this.hasAddedDocs = true;
          this.emit( { type: 'langchain-run-complete', data: { chunks: chunks.length } });
          return { status: 'completed', documents: chunks.length };
        } else {
          this.emit( { type: 'langchain-run-warning', data: { message: 'nothing embedded' } });
          return { status: 'warning', message: 'nothing to process' };
        }      
      } else {
        await this.setStatusForLoadedDocs(docs);
        this.emit( { type: 'langchain-run-warning', data: { message: 'nothing embedded' } });
        return { status: 'warning', message: 'pending ocr tasks' };
      }
    }).catch((err) => {
      log.error('load error:', err);
      return { status: 'error', message: err };
    });    
  }
}
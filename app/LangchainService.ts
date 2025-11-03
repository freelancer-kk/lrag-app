import { ipcMain } from 'electron';
import { DirectoryLoader, UnknownHandling } from "langchain/document_loaders/fs/directory";
import {
  JSONLoader,
  JSONLinesLoader,
} from "langchain/document_loaders/fs/json";
import { TextLoader } from "langchain/document_loaders/fs/text";
import { CSVLoader } from "@langchain/community/document_loaders/fs/csv";
import { PDFLoader } from "@langchain/community/document_loaders/fs/pdf";
import { PPTXLoader } from "@langchain/community/document_loaders/fs/pptx";
import { DocxLoader } from "@langchain/community/document_loaders/fs/docx";
import { OllamaEmbeddings } from "@langchain/ollama";
import { RecursiveCharacterTextSplitter, RecursiveCharacterTextSplitterParams } from 'langchain/text_splitter'
import { Document } from "@langchain/core/documents";
import { mkdirSync } from 'fs';
import * as path from 'path';
import { MemoryVectorStore } from "langchain/vectorstores/memory";
import { HNSWLib } from "@langchain/community/vectorstores/hnswlib";
import SemanticChunking, { LanguageTypes } from './SemanticChunking';
import * as fs from 'fs';
import OCRProcessor from './OCRProcessor';
import { v4 as uuidv4 } from 'uuid';

export enum EVectorStoreType {
  Memory = 0,
  HNSWLib,
}

export default class LangchainService {
  doc_path: string;
  root_doc_path: string;
  db_path: string;
  embeddings: OllamaEmbeddings;
  vectorStore: HNSWLib | MemoryVectorStore | undefined;
  webContents: Electron.WebContents | undefined;
  hasAddedDocs = false;
  numOfDocs: number = 0;
  semanticChunking: SemanticChunking;
  vectorStoreType: EVectorStoreType | undefined;
  ocrProcessor: OCRProcessor;
  uuid: string;
  baseUrl: string;

  constructor(doc_path: string, db_dir: string, ocrProcessor: OCRProcessor, baseUrl: string = "http://localhost:11434", model: string = "embeddinggemma:300m") {
    this.doc_path = doc_path;
    this.root_doc_path = doc_path;
    mkdirSync(path.join(db_dir, 'hnsw'), { recursive: true });
    this.db_path = path.join(db_dir, 'hnsw');    
  
    console.log('db_path:', this.db_path);
    console.log('doc_path:', this.doc_path);

    this.embeddings = new OllamaEmbeddings({
        model,
        baseUrl
    });
    this.baseUrl = baseUrl;
    
    this.semanticChunking = new SemanticChunking(baseUrl, model);

    this.ocrProcessor = ocrProcessor;          
          
    this.uuid = uuidv4();

    console.log('LangchainService initialized');        
  }

  register = (webContents: Electron.WebContents | undefined) => {
    this.webContents = webContents;
    this.semanticChunking.register(webContents);
    this.ocrProcessor.register(webContents);
    ipcMain.on('ingest', async (event: any, arg: any) => {
      const { callbackId, command, params }= arg;
      console.log('LangchainService:', callbackId, command, params)
      let response: any = {}
      switch (command) {
        case "start": {
          this.doc_path = path.join(this.root_doc_path, params.collection);
          response = await this.run(params);          
        }
        break;
        case "load": {
          response = await this.loadVectorStore(params.localVector ? EVectorStoreType.Memory : EVectorStoreType.HNSWLib, params.collection);
        }
        break;
        case "save": {
          response = await this.saveVectorStore(params.localVector ? EVectorStoreType.Memory : EVectorStoreType.HNSWLib, params.collection);
        }
        break;
        case "delete": {
          response = await this.deleteVectorStore(params.localVector ? EVectorStoreType.Memory : EVectorStoreType.HNSWLib, params.collection);
        }
        break;        
        case "reset": {
          response = await this.resetVectorStore(params.localVector ? EVectorStoreType.Memory : EVectorStoreType.HNSWLib, params.collection);
        }
        break;
        case "indexed": {
          response = await this.isDocumentIndexed(params.localVector ? EVectorStoreType.Memory : EVectorStoreType.HNSWLib, params.source);
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
    if (vectorStoreType !== EVectorStoreType.Memory && this.vectorStore) {
      try {
        const similaritySearchResults: Document[] = await this.vectorStore.similaritySearch(
          path.basename(docSource),
          1,
          (doc: Document) => doc.metadata.source === docSource,
        );
        return similaritySearchResults.length > 0;
      } catch (e) {
        console.error(e);
        return false;
      }
    }
    return false;
  }

  loadVectorStore = async (vectorStoreType: EVectorStoreType, collection: string): Promise<boolean | undefined> => {
    if (vectorStoreType !== EVectorStoreType.Memory) {
      try {
        this.vectorStore = await HNSWLib.load(path.join(this.db_path, collection), this.embeddings);        
        this.vectorStoreType = vectorStoreType;        
        this.hasAddedDocs = true;
        return true;
      } catch (e) {
        console.error(e);
        await this.resetVectorStore(vectorStoreType, collection);
        return false;
      }
    } else {
      await this.resetVectorStore(vectorStoreType, collection);
    }
  }

  saveVectorStore = async (vectorStoreType: EVectorStoreType, collection: string): Promise<boolean | undefined> => {
    if (vectorStoreType !== EVectorStoreType.Memory && this.vectorStore) {
      try {
        await (this.vectorStore as HNSWLib).save(path.join(this.db_path, collection));
        return true;
      } catch (e) {
        console.error(e);
        return false;
      }
    }
  }

  deleteVectorStore = async (vectorStoreType: EVectorStoreType, collection: string) => {
    if (vectorStoreType !== EVectorStoreType.Memory && this.vectorStore) {
      try {
        await (this.vectorStore as HNSWLib).delete({ directory: path.join(this.db_path, collection) });
      } catch (e) {
        console.error(e);
      }
    }
  }
  
  resetVectorStore = async (vectorStoreType: EVectorStoreType, collection: string): Promise<boolean> => {
    this.vectorStore = undefined;
    this.vectorStoreType = vectorStoreType;
    if (vectorStoreType === EVectorStoreType.Memory) {
      this.vectorStore = await MemoryVectorStore.fromDocuments([], this.embeddings);
    } else {
      this.vectorStore = await HNSWLib.fromDocuments([], this.embeddings);
      await this.deleteVectorStore(vectorStoreType, collection);
    }
    return true;
  }

  addDocuments = async (docs: Document[]): Promise<void> => {    
    console.log('addDocuments:', docs.length);
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
    console.log('set status:', docs.length);    
    const added_doc_names: string[] = [];
    for await (const ld of docs) {
      if (added_doc_names.findIndex(f => f === ld.metadata.source) === -1) {
        added_doc_names.push(ld.metadata.source);
        this.emit( { type: 'langchain-run-doc-added', data: { source: ld.metadata.source } });
      }
    }
  }
  
  getSearchableVectorStore = (): HNSWLib | MemoryVectorStore | undefined => {
    return this.vectorStore;
  }

  load = (params: any): Promise<Document[]> => {
    const loader: DirectoryLoader = new DirectoryLoader(
      this.doc_path,
      {
        ".json": (path) => new JSONLoader(path, "/texts"),
        ".jsonl": (path) => new JSONLinesLoader(path, "/html"),
        ".txt": (path) => new TextLoader(path),
        ".md": (path) => new TextLoader(path),
        ".xml": (path) => new TextLoader(path),
        ".csv": (path) => new CSVLoader(path, {
          separator: params.separator
        }),
        ".xlsm": (path) => new CSVLoader(path),
        ".xls": (path) => new CSVLoader(path),
        ".pdf": (path) => new PDFLoader(path, {
          splitPages: true,
          parsedItemSeparator: ""  
        }),
        ".ppt": (path) => new PPTXLoader(path),
        ".pptx": (path) => new PPTXLoader(path),
        ".doc": (path) => new DocxLoader(path),
        ".docx": (path) => new DocxLoader(path),
      },
      true,
      UnknownHandling.Warn          
    )
    return loader.load().then(async (docs: Document[]) => {
      const uniqueDocs: Document[] = docs.reduce(
        (acc: Document[], cur: Document) => (acc.findIndex(f => f.metadata.source === cur.metadata.source && f.pageContent === cur.pageContent) > -1 ? acc : [...acc, cur]),
        [],
      );
      console.log('loaded:', uniqueDocs.length);
      for await (const doc of uniqueDocs) {
        // console.log(doc.metadata.source, '=>', doc.pageContent);
        this.emit( { type: 'langchain-run-doc', data: { id: doc.id, source: path.basename(doc.metadata.source), metadata: doc.metadata } });
      }
      return uniqueDocs;
    })        
  }

  split = async (docs: Document[], params: Partial<RecursiveCharacterTextSplitterParams> | undefined, language: LanguageTypes | undefined = undefined ): Promise<Document[]> => {
    if (params && params.chunkSize && params.chunkOverlap && (params?.chunkSize > 0 || params?.chunkOverlap > 0)) {
      console.log('splitting:docs:', params, language, docs.length);
      
      let splitter: RecursiveCharacterTextSplitter;
      if (language) {
        splitter = RecursiveCharacterTextSplitter.fromLanguage(language, params);
      } else {
        splitter = new RecursiveCharacterTextSplitter(params);
      }
      const chunks: Document[] = await splitter.splitDocuments(docs);
      
      console.log('chunks:', chunks.length);
      return chunks;
    } else {
      return docs;
    }
  }

  semanticSplit = async (model: string, docs: Document[], params: Partial<RecursiveCharacterTextSplitterParams> | undefined, language: LanguageTypes | undefined = undefined ): Promise<Document[]> => {
    if (params && params.chunkSize && params.chunkOverlap && (params?.chunkSize > 0 || params?.chunkOverlap > 0)) {
      console.log('semantic:splitting:docs:', params, language, docs.length);
      
      let chunks: Document[] = [];
      let i = 1;
      for await (const doc of docs) {
        chunks = chunks.concat(await this.semanticChunking.chunk(model, doc, i, docs.length));
        i++;
      }
      
      console.log('semantic:chunks:', chunks.length);
      return chunks;  
    } else {
      return docs;
    }
  }

  OCRDocs = async (loaded_docs: Document[], doc_path: string): Promise<boolean> => {
    let hasOCRTasks: boolean = false;
    const file_names: string[] = fs.readdirSync(doc_path);
    // console.log('loaded_docs:', loaded_docs[0]);
    // console.log('file_names:', file_names);
    const loaded_doc_names: string[] = [];
    for await (const ld of loaded_docs) {
      if (loaded_doc_names.findIndex(f => f === ld.metadata.source) === -1) {
        loaded_doc_names.push(ld.metadata.source);
      }
    }

    for await (const fn of file_names) {
      if (loaded_doc_names.findIndex(ldn => path.basename(ldn) === fn) === -1) {
        if (fn.endsWith('pdf') || fn.endsWith('PDF')) {
          // file has not been loaded mark it for OCR processing
          console.log('OCR:REQUEST:put:', path.join(doc_path, fn));
          
          this.ocrProcessor.put(
            path.join(doc_path, fn),
            this.uuid + '-' + path.basename(fn)
          )
          hasOCRTasks = true;
        } else {
          console.log('OCR ignoring non pdf:', fn);
          this.emit( { type: 'langchain-run-ocr-ignore', data: { name: fn } });
        }
      }
    }
    // await this.ocrProcessor.disconnect();
    return hasOCRTasks;
  }

  run = async (params: any): Promise<any> => {
    this.emit( { type: 'langchain-run-start', data: {} } );
    return this.load(params).then(async (docs: Document[]) => {
      this.emit( { type: 'langchain-run-loaded', data: { documents: docs.length } });
      console.log('docs:length:', docs.length)
      let hasOCRTasks: boolean = false
      if (params.localVector === false) {
        // Check for OCR
        hasOCRTasks = await this.OCRDocs(docs, this.doc_path);
      }
      if (!hasOCRTasks) {
        this.embeddings = new OllamaEmbeddings({
            model: params.embeddings,
            baseUrl: this.baseUrl
        });
        console.log('embeddings:', params.embeddings, this.baseUrl);
        await this.resetVectorStore(params.localVector, params.collection);          
        this.emit( { type: 'langchain-run-splitting', data: { documents: docs.length } });
        let chunks: Document[] = [];
        
        let sd: string = '';
        if (docs[0]) {
          sd = docs[0].metadata.source;
          console.log('first doc ends with:', sd);
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
          this.emit( { type: 'langchain-run-warning', data: { message: 'nothing indexed' } });
          return { status: 'warning', message: 'nothing to process' };
        }
      /*
      } else {
        this.emit( { type: 'langchain-run-warning', data: { message: 'document(s) loaded but not processed, empty or latest was incompatible' } });
        return { status: 'warning', message: 'document(s) loaded but not processed, empty or latest was incompatible' };
      }
      */
      } else {
        await this.setStatusForLoadedDocs(docs);
         this.emit( { type: 'langchain-run-warning', data: { message: 'nothing indexed' } });
        return { status: 'warning', message: 'pending ocr tasks' };
      }
    }).catch((err) => {
      console.error('load error:', err);
      return { status: 'error', message: err };
    });    
  }
}
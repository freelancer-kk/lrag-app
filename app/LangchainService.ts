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
import DockerEnv from './DockerEnv';
import { v4 as uuidv4 } from 'uuid';


export enum EVectorStoreType {
  Memory = 0,
  HNSWLib,
}

export default class LangchainService {
  doc_path: string;
  db_path: string;
  input_path: string;
  embeddings: OllamaEmbeddings;
  vectorStore: HNSWLib | MemoryVectorStore | undefined;
  webContents: Electron.WebContents | undefined;
  hasAddedDocs = false;
  numOfDocs: number = 0;
  semanticChunking: SemanticChunking;
  vectorStoreType: EVectorStoreType | undefined;
  ocrProcessor: OCRProcessor;
  uuid: string;

  constructor(doc_path: string, db_dir: string, dockerEnv: DockerEnv, baseUrl: string = "http://localhost:11434", model: string = "embeddinggemma:300m") {
    this.doc_path = doc_path;
    mkdirSync(path.join(db_dir, 'sql'), { recursive: true });
    // this.db_path = path.join(db_dir, 'sql', 'sqlite.db');    
    this.db_path = path.join(db_dir, 'sql');    
    this.input_path = path.join(db_dir, '_input');
    mkdirSync(this.input_path, { recursive: true });

    console.log('db_path:', this.db_path);
    console.log('input_path:', this.input_path);
    console.log('doc_path:', this.doc_path);

    this.embeddings = new OllamaEmbeddings({
        model,
        baseUrl
    });
    
    this.semanticChunking = new SemanticChunking(baseUrl, model);

    this.ocrProcessor = new OCRProcessor(dockerEnv);
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
          response = await this.run(params);          
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

  resetVectorStore = async (vectorStoreType: EVectorStoreType) => {
    this.vectorStore = undefined;
    this.vectorStoreType = vectorStoreType;
    if (vectorStoreType === EVectorStoreType.Memory) {
      this.vectorStore = await MemoryVectorStore.fromDocuments([], this.embeddings);
    } else {
      this.vectorStore = await HNSWLib.fromDocuments([], this.embeddings);
    }
  }

  addDocuments = async (docs: Document[]): Promise<void> => {    
    console.log('addDocuments:', docs.length);
    let i: number = 1;
    this.emit( { type: 'langchain-run-add-chunk', data: { chunk: 0, total: docs.length  } });
    let docBatch: Document[] = [];
    for await (const doc of docs) {
      docBatch.push(doc);
      if (i % 10 === 0) {
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

  semanticSplit = async (docs: Document[], params: Partial<RecursiveCharacterTextSplitterParams> | undefined, language: LanguageTypes | undefined = undefined ): Promise<Document[]> => {
    if (params && params.chunkSize && params.chunkOverlap && (params?.chunkSize > 0 || params?.chunkOverlap > 0)) {
      console.log('semantic:splitting:docs:', params, language, docs.length);
      
      let chunks: Document[] = [];
      let i = 1;
      for await (const doc of docs) {
        chunks = chunks.concat(await this.semanticChunking.chunk(doc, i, docs.length));
        i++;
      }
      
      console.log('semantic:chunks:', chunks.length);
      return chunks;  
    } else {
      return docs;
    }
  }

  OCRDocs = async (loaded_docs: Document[], doc_path: string): Promise<void> => {
    await this.ocrProcessor.connect();
    const file_names: string[] = fs.readdirSync(doc_path);
    const loaded_doc_names: string[] = loaded_docs.reduce(
      (acc: Document[], cur: Document) => (acc.findIndex(f => f.metadata.source === cur.metadata && cur.metadata.source) > -1 ? acc : [...acc, cur.metadata.source]),
      [],
    );
    for await (const fn of file_names) {
      if (loaded_doc_names.findIndex(ldn => path.basename(ldn) === fn) === -1) {
        // file has not been loaded mark it for OCR processing
        console.log('put:', path.join(doc_path, fn));

        this.ocrProcessor.put(
          path.join(doc_path, fn),
          this.uuid + '-' + path.basename(fn)
        ) 
      }
    }
    // await this.ocrProcessor.disconnect();
  }

  run = async (params: any): Promise<any> => {
    this.emit( { type: 'langchain-run-start', data: {} } );
    return this.load(params).then(async (docs: Document[]) => {
      if (params.localVector === false) {
        // Check for OCR
        await this.OCRDocs(docs, this.doc_path);
      }
      this.emit( { type: 'langchain-run-loaded', data: { documents: docs.length } });
      console.log('docs:length:', docs.length)
      // if (docs.length > 0) {
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
            chunks = await this.semanticSplit(docs, params);
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
          await this.resetVectorStore(params.localVector ? EVectorStoreType.Memory : EVectorStoreType.HNSWLib);
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
    }).catch((err) => {
      console.error('load error:', err);
      return { status: 'error', message: err };
    });    
  }
}
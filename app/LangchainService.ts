import { ipcMain } from 'electron';
import { DirectoryLoader, UnknownHandling } from "langchain/document_loaders/fs/directory";
import {
  JSONLoader,
  JSONLinesLoader,
} from "langchain/document_loaders/fs/json";
import { TextLoader } from "langchain/document_loaders/fs/text";
import { CSVLoader } from "@langchain/community/document_loaders/fs/csv";
import { PDFLoader } from "@langchain/community/document_loaders/fs/pdf";
import { WebPDFLoader } from "@langchain/community/document_loaders/web/pdf";
import { PPTXLoader } from "@langchain/community/document_loaders/fs/pptx";
import { DocxLoader } from "@langchain/community/document_loaders/fs/docx";
import { OllamaEmbeddings } from "@langchain/ollama";
import { RecursiveCharacterTextSplitter } from 'langchain/text_splitter'
import { Document } from "@langchain/core/documents";
import { mkdirSync } from 'fs';
import * as path from 'path';
import { MemoryVectorStore } from "langchain/vectorstores/memory";

//TODO: Build my own native Mac/Win https://github.com/nisaacson/pdf-extract
// OR get ocrmypdf working on windows with auto install and mac os auto install
// https://ocrmypdf.readthedocs.io/en/latest/installation.html#native-windows

export default class LangchainService {
  doc_path: string;
  db_path: string;
  input_path: string;
  embeddings: OllamaEmbeddings;
  vectorStore: MemoryVectorStore;
  webContents: Electron.WebContents | undefined;
  hasAddedDocs = false;

  constructor(doc_path: string, db_dir: string, baseUrl: string = "http://localhost:11434", model: string = "embeddinggemma:300m") {
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

    this.vectorStore = new MemoryVectorStore(
      this.embeddings
    )

    console.log('LangchainService initialized');        
  }

  register = (webContents: Electron.WebContents | undefined) => {
    this.webContents = webContents;
    ipcMain.on('ingest', async (event: any, arg: any) => {
      const { callbackId, command, params }= arg;
      console.log('LangchainService:', callbackId, command, params)
      let response: any = {}
      switch (command) {
        case "start": {
          response = await this.run();          
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

  addDocuments = (docs: Document[]): Promise<void> => {
    return this.vectorStore.addDocuments(docs);    
  }

  getSearchableVectorStore = (): Promise<MemoryVectorStore> => {
    if (!this.hasAddedDocs) {
      return this.run().then((value: any) => {
        return Promise.resolve(this.vectorStore);    
      })
    } else {
      return Promise.resolve(this.vectorStore);
    }
  }

  load = (): Promise<Document[]> => {
    const loader: DirectoryLoader = new DirectoryLoader(
      this.doc_path,
      {
        ".json": (path) => new JSONLoader(path, "/texts"),
        ".jsonl": (path) => new JSONLinesLoader(path, "/html"),
        ".txt": (path) => new TextLoader(path),
        ".csv": (path) => new CSVLoader(path, "text"),
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
    return loader.load();
  }

  split = async (docs: Document[]): Promise<Document[]> => {
    console.log('loaded:doc:', docs.length);
    const splitter: RecursiveCharacterTextSplitter = new RecursiveCharacterTextSplitter(
      { 
        chunkSize: 1000,
        chunkOverlap: 200
      }
    )

    // let chunks: Document[] = [];
    const chunks: Document[] = await splitter.splitDocuments(docs);
    /*
    for await (const doc of docs) {
      const docOutput = await splitter.splitDocuments([
        doc,
      ]);
      chunks = chunks.concat(docOutput);
    }
      */
    console.log('chunks:', chunks.length);
    return chunks;
  }

  run = async (): Promise<any> => {
    this.emit( { type: 'langchain-run-start', data: {} } );
    return this.load().then(async (docs: Document[]) => {
      this.emit( { type: 'langchain-run-loaded', data: { documents: docs.length } });
      if (docs.length > 0) {
        this.emit( { type: 'langchain-run-splitting', data: { documents: docs.length } });        
        const chunks = await this.split(docs);
        let uniqueNo: number = 0;
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
          this.emit( { type: 'langchain-run-error', data: { message: 'no chunks created' } });
          return { status: 'error', message: 'no chunks created' };
        }
      } else {
        this.emit( { type: 'langchain-run-warning', data: { message: 'document(s) loaded but not processed, empty or latest was incompatible' } });
        return { status: 'warning', message: 'document(s) loaded but not processed, empty or latest was incompatible' };
      }
    }).catch((err) => {
      console.error('load error:', err);
      return { status: 'error', message: err };
    });    
  }
}
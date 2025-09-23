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
import { existsSync, unlinkSync, mkdirSync, promises, statSync, Stats, rmSync, copyFileSync } from 'fs';
import * as path from 'path';

import { LibSQLVectorStore } from "@langchain/community/vectorstores/libsql";
import { Client, createClient, ResultSet } from "@libsql/client";
import { VectorStore } from "@langchain/core/vectorstores";

//TODO: Build my own native Mac/Win https://github.com/nisaacson/pdf-extract
// OR get ocrmypdf working on windows with auto install and mac os auto install
// https://ocrmypdf.readthedocs.io/en/latest/installation.html#native-windows

interface FileStat {
  path: string;
  stats: Stats;
}

async function* walk(dir: string): AsyncGenerator<FileStat>  {
  for await (const d of await promises.opendir(dir)) {
    const fp: string = path.join(dir, d.name);    
    if (d.isDirectory()) yield* walk(fp);
    else if (d.isFile()) {      
      yield {
        path: fp,
        stats: statSync(fp)
      }
    }
  }
}
export default class LangchainService {
  doc_path: string;
  db_path: string;
  input_path: string;
  libsqlClient: Client;
  embeddings: OllamaEmbeddings;
  vectorStore: VectorStore;
  webContents: Electron.WebContents | undefined;

  constructor(doc_path: string, db_dir: string, baseUrl: string = "http://localhost:11434", model: string = "embeddinggemma:300m") {
    this.doc_path = doc_path;
    mkdirSync(path.join(db_dir, 'sql'), { recursive: true });
    this.db_path = path.join(db_dir, 'sql', 'sqlite.db');    
    this.input_path = path.join(db_dir, '_input');
    mkdirSync(this.input_path, { recursive: true });

    console.log('db_path:', this.db_path);
    console.log('input_path:', this.input_path);
    console.log('doc_path:', this.doc_path);

    const firstTime: boolean = !existsSync(this.db_path);
    this.libsqlClient = createClient({
      url: "file:" + this.db_path,
    });
    this.createDBArtifacts(firstTime);

    this.embeddings = new OllamaEmbeddings({
        model,
        baseUrl
    });

    this.vectorStore = this.getNewVectorStore();
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

  getNewVectorStore = () => {
    return new LibSQLVectorStore(
      this.embeddings, {
        db: this.libsqlClient,
        table: "DOCUMENTS",
        column: "embedc",
      }
    );
  }

  createDBArtifacts = (firstTime: boolean) => {
    if (firstTime) {
      console.log("First time creating table and index!");
      this.libsqlClient.execute({
        sql: "CREATE TABLE IF NOT EXISTS DOCUMENTS ( id INTEGER PRIMARY KEY AUTOINCREMENT, content TEXT, metadata TEXT, embedc F32_BLOB(768));",
        args: {}
      }).then(() => {
        this.libsqlClient.execute({
          sql: "CREATE INDEX IF NOT EXISTS idx_DOCUMENTS_embedc ON DOCUMENTS(libsql_vector_idx(embedc));",
          args: {}
        }).then(() => {
          this.libsqlClient.execute({
            sql: "CREATE TABLE files(path,timestamp);",
            args: {}
          })
        });
      })
    }
  }

  resetDB = (): void => {
    this.libsqlClient.close();
    unlinkSync(this.db_path);
    this.libsqlClient = createClient({
      url: "file:" + this.db_path,
    });
    this.createDBArtifacts(true);
  }

  getVectorStore = (): VectorStore => {
    return this.vectorStore;
  }

  getSqlClient = (): Client => {
    return this.libsqlClient;
  } 

  load = (): Promise<Document[]> => {
    const loader: DirectoryLoader = new DirectoryLoader(
      this.input_path,
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
    console.log('loaded:docs:split', docs.length);
    const splitter: RecursiveCharacterTextSplitter = new RecursiveCharacterTextSplitter(
      { 
        chunkSize: 1000,
        chunkOverlap: 200
      }
    )

    let chunks: Document[] = [];
    for await (const doc of docs) {
      const docOutput = await splitter.splitDocuments([
        new Document(doc),
      ]);
      chunks = chunks.concat(docOutput);
    }
    console.log('chunks:', chunks.length);
    return chunks;
  }

  addDocuments = async (docs: Document[]) => {
    console.log('Adding chunks to sqllite:', docs.length);
    const addedDocs: string[] | void = await this.vectorStore.addDocuments(docs);
    console.log('sqllite added:', addedDocs ? addedDocs.length : 0);
  }

  delDocuments = async (ids: string[]) => {
    console.log('Removing docs with ids:', ids.length);
    await this.vectorStore.delete({ ids });    
  }

  retrieve = async (search: string) => {
    const similaritySearchWithScoreResults = await this.vectorStore.similaritySearchWithScore(search, 3);
    for (const [doc, score] of similaritySearchWithScoreResults) {
      console.log(
        `${score.toFixed(3)} ${doc.pageContent} [${JSON.stringify(doc.metadata)}]`
      );
    }
  }

  getDocIdsForDoc = async (docPath: string): Promise<string[]> => {
    const result: ResultSet = await this.libsqlClient.execute({
      sql: "SELECT id FROM DOCUMENTS WHERE json_extract(metadata, '$.source') = ?",
      args: [docPath]
    });
    const ids: string[] = [];
    for await (const row of result.rows) {
      const id: string | undefined = row['id']?.toString();
      if (id) {
        ids.push(id);
      }
    }
    return ids;
  }
  
  filesWalk = async (): Promise<any[]> => {
    const files: any[] = [];
    for await (const ps of walk(this.doc_path)) {
      files.push({
        path: ps.path,
        timestamp: ps.stats.mtime
      })
    }
    return files;
  }

  actionList = async (): Promise<any[]> => {
    const files: any[] = await this.filesWalk();
        
    const action_list: any[] = [];
    const result: ResultSet = await this.libsqlClient.execute({
      sql: "SELECT path, timestamp FROM files",
      args: []
    });
    console.log('actionList:result', result.rows.length);
    for await (const row of result.rows) {
      const path: string | undefined = row['path']?.toString();
      const timestamp: number | string | bigint | Object | undefined = row['timestamp']?.valueOf();      
      if (path && timestamp) {        
        if (!files.find((f: any) => f.path === path)) {
          console.log('del row:', path, timestamp);
          action_list.push({
            "action" : 2,
            "path": path
          })
          const delResult: ResultSet = await this.libsqlClient.execute({
            sql: "DELETE FROM files WHERE path = ?",
            args: [path]
          });
        } else {
          if (files.find((f: any) => f.path === path && (f.timestamp > timestamp))) {
            console.log('update row:', path, timestamp);
            action_list.push({
              "action" : 1,
              "path": path
            })
            const updateResult: ResultSet = await this.libsqlClient.execute({
              sql: "UPDATE files set timestamp = ? WHERE path = ?",
              args: [files.find((f: any) => f.path === path).timestamp, path]
            });                          
          }             
        }
      }
    }

    for await (const file of files) {
      if (!result.rows.find((r: any) => r['path']?.toString() === file.path)) {
        console.log('new row:', file.path, file.timestamp);
        action_list.push({
          "action" : 0,
          "path": file.path
        });
        const insertResult: ResultSet = await this.libsqlClient.execute({
          sql: "INSERT INTO files (path, timestamp) VALUES (?, ?)",
          args: [file.path, file.timestamp]
        });                          
      }
    }
    
    return action_list;
  }

  run = async (): Promise<any> => {
    const actions: any[] = await this.actionList();

    rmSync(this.input_path, { recursive: true, force: true });
    mkdirSync(this.input_path, { recursive: true });

    console.log('actions:', actions.length);
    
    let newChangedDocs: boolean = false;
    for await (const action of actions) {
      if (action.action === 2) {
        console.log('deleting doc:', action.path);
        const ids: string[] = await this.getDocIdsForDoc(action.path);
        if (ids.length > 0) {
          console.log('deleting doc ids:', ids);
          await this.delDocuments(ids);
        }
      } else if (action.action === 0 || action.action === 1) {
        console.log('new/changed doc:', action.path);
        copyFileSync(action.path, path.join(this.input_path, path.basename(action.path)));
        newChangedDocs = true;
      }
    }
    
    if (newChangedDocs) {
      this.emit( { type: 'langchain-run-start', data: {} } );
      return this.load().then(async (docs: Document[]) => {      
        this.emit( { type: 'langchain-run-loaded', data: { documents: docs.length } });
        if (docs.length > 0) {
          this.emit( { type: 'langchain-run-splitting', data: { documents: docs.length } });        
          const chunks = await this.split(docs);
          this.emit( { type: 'langchain-run-split', data: { chunks: chunks.length } });
          if (chunks.length > 0) {
            this.emit( { type: 'langchain-run-adding', data: { chunks: chunks.length } });                    
            return this.addDocuments(chunks).then(() => {
              this.emit( { type: 'langchain-run-complete', data: { documents: docs.length, chunks: chunks.length } });                    
              console.log('Langchain run completed');
              return { status: 'completed', documents: docs.length, chunks: chunks.length };
            }).catch((err) => {
              console.error('addDocuments error:', err);
              this.emit( { type: 'langchain-run-error', data: { message: err } });
              return { status: 'error', message: err };
            });
          } else {
            this.emit( { type: 'langchain-run-error', data: { message: 'no chunks created' } });
            return { status: 'error', message: 'no chunks created' };
          }         
        } else {
            this.emit( { type: 'langchain-run-error', data: { message: 'document(s) not loaded (incompatible)' } });
            return { status: 'error', message: 'document(s) not loaded (incompatible)' };
        }
      }).catch((err) => {
        console.error('load error:', err);
        return { status: 'error', message: err };
      });
    } else {
      console.log('No new or changed documents, skipping ingestion');
      return { status: 'completed', documents: 0, chunks: 0 };      
    }    
  }
}
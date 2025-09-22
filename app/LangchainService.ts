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
import { RecursiveCharacterTextSplitter } from 'langchain/text_splitter'
import { Document } from "@langchain/core/documents";
import { existsSync, unlinkSync } from 'fs';

import { LibSQLVectorStore } from "@langchain/community/vectorstores/libsql";
import { Client, createClient } from "@libsql/client";
import { VectorStore } from "@langchain/core/vectorstores";

export default class LangchainService {
  doc_path: string;
  db_path: string;
  libsqlClient: Client;
  embeddings: OllamaEmbeddings;
  vectorStore: VectorStore;

  constructor(doc_path: string, db_path: string, baseUrl: string = "http://localhost:11434", model: string = "embeddinggemma:300m") {
    this.doc_path = doc_path;
    this.db_path = db_path;

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
        })
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

  addDocuments = async (docs: Document[], openClose: boolean = false) => {
    if (openClose && this.libsqlClient.closed) {
      this.libsqlClient = createClient({
        url: "file:" + this.db_path,
      });
      this.vectorStore = this.getNewVectorStore();
    }

    console.log('Adding chunks to sqllite:', docs.length);
    const addedDocs: string[] | void = await this.vectorStore.addDocuments(docs);
    console.log('sqllite added:', addedDocs ? addedDocs.length : 0);

    if (openClose) {
      this.libsqlClient.close();
    }
  }

  delDocuments = async (ids: string[], openClose: boolean = false) => {
    if (openClose && this.libsqlClient.closed) {
      this.libsqlClient = createClient({
        url: "file:" + this.db_path,
      });
      this.vectorStore = this.getNewVectorStore();
    }

    console.log('Removing docs with ids:', ids.length);
    await this.vectorStore.delete({ ids });

    if (openClose) {
      this.libsqlClient.close();
    }
  }

  retrieve = async (search: string) => {
    const similaritySearchWithScoreResults = await this.vectorStore.similaritySearchWithScore(search, 3);
    for (const [doc, score] of similaritySearchWithScoreResults) {
      console.log(
        `${score.toFixed(3)} ${doc.pageContent} [${JSON.stringify(doc.metadata)}]`
      );
    }
  }
}
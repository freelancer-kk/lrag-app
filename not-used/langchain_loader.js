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
import { existsSync } from 'fs';

import { LibSQLVectorStore } from "@langchain/community/vectorstores/libsql";
import { createClient } from "@libsql/client";

const load = async () => {
  const loader = new DirectoryLoader(
    "C:\\Users\\kabir\\Documents\\doc-ai",
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
  loader.load();
  const docs = await loader.load();
  // disable console.warn calls
  console.log('loaded:docs:split', docs.length);

  const splitter = new RecursiveCharacterTextSplitter(
    { 
      chunkSize: 1000,
      chunkOverlap: 200
    }
  )

  let chunks = [];
  for await (const doc of docs) {
    const docOutput = await splitter.splitDocuments([
      new Document(doc),
    ]);
    chunks = chunks.concat(docOutput);
  }
  
  console.log('chunks:', chunks.length);
  // console.log('doc', docs[0]);
  // console.log('chunk', chunks[0]);

  const embeddings = new OllamaEmbeddings({
      model: "embeddinggemma:300m",
      baseUrl: "http://localhost:11434",      
  });
  
  
  const firstTime = !existsSync('./dev.db');

  const libsqlClient = createClient({
    url: "file:./dev.db",
  });

  if (firstTime) {
    console.log("First time creating table and index!");
    await libsqlClient.execute({
      sql: "CREATE TABLE IF NOT EXISTS DOCUMENTS ( id INTEGER PRIMARY KEY AUTOINCREMENT, content TEXT, metadata TEXT, embedc F32_BLOB(768));"
    })
    await libsqlClient.execute({
      sql: "CREATE INDEX IF NOT EXISTS idx_DOCUMENTS_embedc ON DOCUMENTS(libsql_vector_idx(embedc));"
    })
  }

  const vectorStore = new LibSQLVectorStore(
    embeddings, {
      db: libsqlClient,
      table: "DOCUMENTS",
      column: "embedc",
    }
  );

  console.log('Adding docs to sqllite!');
  const addedDocs = await vectorStore.addDocuments(chunks);
  console.log('sqllite doc ids', addedDocs);


  const similaritySearchWithScoreResults = await vectorStore.similaritySearchWithScore("kabir", 1);

  for (const [doc, score] of similaritySearchWithScoreResults) {
    console.log(
      `${score.toFixed(3)} ${doc.pageContent} [${JSON.stringify(doc.metadata)}]`
    );
  }
}

load();
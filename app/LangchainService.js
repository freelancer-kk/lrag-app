"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __asyncValues = (this && this.__asyncValues) || function (o) {
    if (!Symbol.asyncIterator) throw new TypeError("Symbol.asyncIterator is not defined.");
    var m = o[Symbol.asyncIterator], i;
    return m ? m.call(o) : (o = typeof __values === "function" ? __values(o) : o[Symbol.iterator](), i = {}, verb("next"), verb("throw"), verb("return"), i[Symbol.asyncIterator] = function () { return this; }, i);
    function verb(n) { i[n] = o[n] && function (v) { return new Promise(function (resolve, reject) { v = o[n](v), settle(resolve, reject, v.done, v.value); }); }; }
    function settle(resolve, reject, d, v) { Promise.resolve(v).then(function(v) { resolve({ value: v, done: d }); }, reject); }
};
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const directory_1 = require("langchain/document_loaders/fs/directory");
const json_1 = require("langchain/document_loaders/fs/json");
const text_1 = require("langchain/document_loaders/fs/text");
const csv_1 = require("@langchain/community/document_loaders/fs/csv");
const pdf_1 = require("@langchain/community/document_loaders/fs/pdf");
const pptx_1 = require("@langchain/community/document_loaders/fs/pptx");
const docx_1 = require("@langchain/community/document_loaders/fs/docx");
const ollama_1 = require("@langchain/ollama");
const text_splitter_1 = require("langchain/text_splitter");
const fs_1 = require("fs");
const path = __importStar(require("path"));
const memory_1 = require("langchain/vectorstores/memory");
//TODO: Build my own native Mac/Win https://github.com/nisaacson/pdf-extract
// OR get ocrmypdf working on windows with auto install and mac os auto install
// https://ocrmypdf.readthedocs.io/en/latest/installation.html#native-windows
class LangchainService {
    constructor(doc_path, db_dir, baseUrl = "http://localhost:11434", model = "embeddinggemma:300m") {
        this.hasAddedDocs = false;
        this.register = (webContents) => {
            this.webContents = webContents;
            electron_1.ipcMain.on('ingest', (event, arg) => __awaiter(this, void 0, void 0, function* () {
                const { callbackId, command, params } = arg;
                console.log('LangchainService:', callbackId, command, params);
                let response = {};
                switch (command) {
                    case "start":
                        {
                            response = yield this.run();
                        }
                        break;
                }
                event.reply('reply', {
                    callbackId,
                    response: JSON.stringify(response)
                });
            }));
        };
        this.emit = (args) => {
            var _a;
            (_a = this.webContents) === null || _a === void 0 ? void 0 : _a.send('event', {
                response: args
            });
        };
        this.addDocuments = (docs) => {
            return this.vectorStore.addDocuments(docs);
        };
        this.getSearchableVectorStore = () => {
            if (!this.hasAddedDocs) {
                return this.run().then((value) => {
                    return Promise.resolve(this.vectorStore);
                });
            }
            else {
                return Promise.resolve(this.vectorStore);
            }
        };
        this.load = () => {
            const loader = new directory_1.DirectoryLoader(this.doc_path, {
                ".json": (path) => new json_1.JSONLoader(path, "/texts"),
                ".jsonl": (path) => new json_1.JSONLinesLoader(path, "/html"),
                ".txt": (path) => new text_1.TextLoader(path),
                ".csv": (path) => new csv_1.CSVLoader(path, "text"),
                ".xlsm": (path) => new csv_1.CSVLoader(path),
                ".xls": (path) => new csv_1.CSVLoader(path),
                ".pdf": (path) => new pdf_1.PDFLoader(path, {
                    splitPages: true,
                    parsedItemSeparator: ""
                }),
                ".ppt": (path) => new pptx_1.PPTXLoader(path),
                ".pptx": (path) => new pptx_1.PPTXLoader(path),
                ".doc": (path) => new docx_1.DocxLoader(path),
                ".docx": (path) => new docx_1.DocxLoader(path),
            }, true, directory_1.UnknownHandling.Warn);
            return loader.load();
        };
        this.split = (docs) => __awaiter(this, void 0, void 0, function* () {
            console.log('loaded:doc:', docs.length);
            const splitter = new text_splitter_1.RecursiveCharacterTextSplitter({
                chunkSize: 1000,
                chunkOverlap: 200
            });
            // let chunks: Document[] = [];
            const chunks = yield splitter.splitDocuments(docs);
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
        });
        this.run = () => __awaiter(this, void 0, void 0, function* () {
            this.emit({ type: 'langchain-run-start', data: {} });
            return this.load().then((docs) => __awaiter(this, void 0, void 0, function* () {
                var _a, e_1, _b, _c;
                this.emit({ type: 'langchain-run-loaded', data: { documents: docs.length } });
                if (docs.length > 0) {
                    this.emit({ type: 'langchain-run-splitting', data: { documents: docs.length } });
                    const chunks = yield this.split(docs);
                    let uniqueNo = 0;
                    try {
                        for (var _d = true, chunks_1 = __asyncValues(chunks), chunks_1_1; chunks_1_1 = yield chunks_1.next(), _a = chunks_1_1.done, !_a; _d = true) {
                            _c = chunks_1_1.value;
                            _d = false;
                            const chunk = _c;
                            chunk.id = String(uniqueNo++);
                        }
                    }
                    catch (e_1_1) { e_1 = { error: e_1_1 }; }
                    finally {
                        try {
                            if (!_d && !_a && (_b = chunks_1.return)) yield _b.call(chunks_1);
                        }
                        finally { if (e_1) throw e_1.error; }
                    }
                    this.emit({ type: 'langchain-run-split', data: { chunks: chunks.length } });
                    if (chunks.length > 0) {
                        this.emit({ type: 'langchain-run-indexing', data: { chunks: chunks.length } });
                        yield this.addDocuments(chunks);
                        this.hasAddedDocs = true;
                        this.emit({ type: 'langchain-run-complete', data: { chunks: chunks.length } });
                        return { status: 'completed', documents: chunks.length };
                    }
                    else {
                        this.emit({ type: 'langchain-run-error', data: { message: 'no chunks created' } });
                        return { status: 'error', message: 'no chunks created' };
                    }
                }
                else {
                    this.emit({ type: 'langchain-run-error', data: { message: 'document(s) not loaded, empty or latest was incompatible' } });
                    return { status: 'error', message: 'document(s) not loaded, empty or latest was incompatible)' };
                }
            })).catch((err) => {
                console.error('load error:', err);
                return { status: 'error', message: err };
            });
        });
        this.doc_path = doc_path;
        (0, fs_1.mkdirSync)(path.join(db_dir, 'sql'), { recursive: true });
        // this.db_path = path.join(db_dir, 'sql', 'sqlite.db');    
        this.db_path = path.join(db_dir, 'sql');
        this.input_path = path.join(db_dir, '_input');
        (0, fs_1.mkdirSync)(this.input_path, { recursive: true });
        console.log('db_path:', this.db_path);
        console.log('input_path:', this.input_path);
        console.log('doc_path:', this.doc_path);
        const firstTime = !(0, fs_1.existsSync)(this.db_path);
        this.embeddings = new ollama_1.OllamaEmbeddings({
            model,
            baseUrl
        });
        this.vectorStore = new memory_1.MemoryVectorStore(this.embeddings);
        console.log('LangchainService initialized');
    }
}
exports.default = LangchainService;
//# sourceMappingURL=LangchainService.js.map
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
var __await = (this && this.__await) || function (v) { return this instanceof __await ? (this.v = v, this) : new __await(v); }
var __asyncValues = (this && this.__asyncValues) || function (o) {
    if (!Symbol.asyncIterator) throw new TypeError("Symbol.asyncIterator is not defined.");
    var m = o[Symbol.asyncIterator], i;
    return m ? m.call(o) : (o = typeof __values === "function" ? __values(o) : o[Symbol.iterator](), i = {}, verb("next"), verb("throw"), verb("return"), i[Symbol.asyncIterator] = function () { return this; }, i);
    function verb(n) { i[n] = o[n] && function (v) { return new Promise(function (resolve, reject) { v = o[n](v), settle(resolve, reject, v.done, v.value); }); }; }
    function settle(resolve, reject, d, v) { Promise.resolve(v).then(function(v) { resolve({ value: v, done: d }); }, reject); }
};
var __asyncDelegator = (this && this.__asyncDelegator) || function (o) {
    var i, p;
    return i = {}, verb("next"), verb("throw", function (e) { throw e; }), verb("return"), i[Symbol.iterator] = function () { return this; }, i;
    function verb(n, f) { i[n] = o[n] ? function (v) { return (p = !p) ? { value: __await(o[n](v)), done: false } : f ? f(v) : v; } : f; }
};
var __asyncGenerator = (this && this.__asyncGenerator) || function (thisArg, _arguments, generator) {
    if (!Symbol.asyncIterator) throw new TypeError("Symbol.asyncIterator is not defined.");
    var g = generator.apply(thisArg, _arguments || []), i, q = [];
    return i = Object.create((typeof AsyncIterator === "function" ? AsyncIterator : Object).prototype), verb("next"), verb("throw"), verb("return", awaitReturn), i[Symbol.asyncIterator] = function () { return this; }, i;
    function awaitReturn(f) { return function (v) { return Promise.resolve(v).then(f, reject); }; }
    function verb(n, f) { if (g[n]) { i[n] = function (v) { return new Promise(function (a, b) { q.push([n, v, a, b]) > 1 || resume(n, v); }); }; if (f) i[n] = f(i[n]); } }
    function resume(n, v) { try { step(g[n](v)); } catch (e) { settle(q[0][3], e); } }
    function step(r) { r.value instanceof __await ? Promise.resolve(r.value.v).then(fulfill, reject) : settle(q[0][2], r); }
    function fulfill(value) { resume("next", value); }
    function reject(value) { resume("throw", value); }
    function settle(f, v) { if (f(v), q.shift(), q.length) resume(q[0][0], q[0][1]); }
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
const documents_1 = require("@langchain/core/documents");
const fs_1 = require("fs");
const path = __importStar(require("path"));
const libsql_1 = require("@langchain/community/vectorstores/libsql");
const client_1 = require("@libsql/client");
function walk(dir) {
    return __asyncGenerator(this, arguments, function* walk_1() {
        var _a, e_1, _b, _c;
        try {
            for (var _d = true, _e = __asyncValues(yield __await(fs_1.promises.opendir(dir))), _f; _f = yield __await(_e.next()), _a = _f.done, !_a; _d = true) {
                _c = _f.value;
                _d = false;
                const d = _c;
                const fp = path.join(dir, d.name);
                if (d.isDirectory())
                    yield __await(yield* __asyncDelegator(__asyncValues(walk(fp))));
                else if (d.isFile()) {
                    yield yield __await({
                        path: fp,
                        stats: (0, fs_1.statSync)(fp)
                    });
                }
            }
        }
        catch (e_1_1) { e_1 = { error: e_1_1 }; }
        finally {
            try {
                if (!_d && !_a && (_b = _e.return)) yield __await(_b.call(_e));
            }
            finally { if (e_1) throw e_1.error; }
        }
    });
}
class LangchainService {
    constructor(doc_path, db_dir, baseUrl = "http://localhost:11434", model = "embeddinggemma:300m") {
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
        this.getNewVectorStore = () => {
            return new libsql_1.LibSQLVectorStore(this.embeddings, {
                db: this.libsqlClient,
                table: "DOCUMENTS",
                column: "embedc",
            });
        };
        this.createDBArtifacts = (firstTime) => {
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
                        });
                    });
                });
            }
        };
        this.resetDB = () => {
            this.libsqlClient.close();
            (0, fs_1.unlinkSync)(this.db_path);
            this.libsqlClient = (0, client_1.createClient)({
                url: "file:" + this.db_path,
            });
            this.createDBArtifacts(true);
        };
        this.getVectorStore = () => {
            return this.vectorStore;
        };
        this.getSqlClient = () => {
            return this.libsqlClient;
        };
        this.load = () => {
            const loader = new directory_1.DirectoryLoader(this.input_path, {
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
            var _a, docs_1, docs_1_1;
            var _b, e_2, _c, _d;
            console.log('loaded:docs:split', docs.length);
            const splitter = new text_splitter_1.RecursiveCharacterTextSplitter({
                chunkSize: 1000,
                chunkOverlap: 200
            });
            let chunks = [];
            try {
                for (_a = true, docs_1 = __asyncValues(docs); docs_1_1 = yield docs_1.next(), _b = docs_1_1.done, !_b; _a = true) {
                    _d = docs_1_1.value;
                    _a = false;
                    const doc = _d;
                    const docOutput = yield splitter.splitDocuments([
                        new documents_1.Document(doc),
                    ]);
                    chunks = chunks.concat(docOutput);
                }
            }
            catch (e_2_1) { e_2 = { error: e_2_1 }; }
            finally {
                try {
                    if (!_a && !_b && (_c = docs_1.return)) yield _c.call(docs_1);
                }
                finally { if (e_2) throw e_2.error; }
            }
            console.log('chunks:', chunks.length);
            return chunks;
        });
        this.addDocuments = (docs) => __awaiter(this, void 0, void 0, function* () {
            console.log('Adding chunks to sqllite:', docs.length);
            const addedDocs = yield this.vectorStore.addDocuments(docs);
            console.log('sqllite added:', addedDocs ? addedDocs.length : 0);
        });
        this.delDocuments = (ids) => __awaiter(this, void 0, void 0, function* () {
            console.log('Removing docs with ids:', ids.length);
            yield this.vectorStore.delete({ ids });
        });
        this.retrieve = (search) => __awaiter(this, void 0, void 0, function* () {
            const similaritySearchWithScoreResults = yield this.vectorStore.similaritySearchWithScore(search, 3);
            for (const [doc, score] of similaritySearchWithScoreResults) {
                console.log(`${score.toFixed(3)} ${doc.pageContent} [${JSON.stringify(doc.metadata)}]`);
            }
        });
        this.getDocIdsForDoc = (docPath) => __awaiter(this, void 0, void 0, function* () {
            var _a, e_3, _b, _c;
            var _d;
            const result = yield this.libsqlClient.execute({
                sql: "SELECT id FROM DOCUMENTS WHERE json_extract(metadata, '$.source') = ?",
                args: [docPath]
            });
            const ids = [];
            try {
                for (var _e = true, _f = __asyncValues(result.rows), _g; _g = yield _f.next(), _a = _g.done, !_a; _e = true) {
                    _c = _g.value;
                    _e = false;
                    const row = _c;
                    const id = (_d = row['id']) === null || _d === void 0 ? void 0 : _d.toString();
                    if (id) {
                        ids.push(id);
                    }
                }
            }
            catch (e_3_1) { e_3 = { error: e_3_1 }; }
            finally {
                try {
                    if (!_e && !_a && (_b = _f.return)) yield _b.call(_f);
                }
                finally { if (e_3) throw e_3.error; }
            }
            return ids;
        });
        this.filesWalk = () => __awaiter(this, void 0, void 0, function* () {
            var _a, e_4, _b, _c;
            const files = [];
            try {
                for (var _d = true, _e = __asyncValues(walk(this.doc_path)), _f; _f = yield _e.next(), _a = _f.done, !_a; _d = true) {
                    _c = _f.value;
                    _d = false;
                    const ps = _c;
                    files.push({
                        path: ps.path,
                        timestamp: ps.stats.mtime
                    });
                }
            }
            catch (e_4_1) { e_4 = { error: e_4_1 }; }
            finally {
                try {
                    if (!_d && !_a && (_b = _e.return)) yield _b.call(_e);
                }
                finally { if (e_4) throw e_4.error; }
            }
            return files;
        });
        this.actionList = () => __awaiter(this, void 0, void 0, function* () {
            var _a, e_5, _b, _c, _d, e_6, _e, _f;
            var _g, _h;
            const files = yield this.filesWalk();
            const action_list = [];
            const result = yield this.libsqlClient.execute({
                sql: "SELECT path, timestamp FROM files",
                args: []
            });
            console.log('actionList:result', result.rows.length);
            try {
                for (var _j = true, _k = __asyncValues(result.rows), _l; _l = yield _k.next(), _a = _l.done, !_a; _j = true) {
                    _c = _l.value;
                    _j = false;
                    const row = _c;
                    const path = (_g = row['path']) === null || _g === void 0 ? void 0 : _g.toString();
                    const timestamp = (_h = row['timestamp']) === null || _h === void 0 ? void 0 : _h.valueOf();
                    if (path && timestamp) {
                        if (!files.find((f) => f.path === path)) {
                            console.log('del row:', path, timestamp);
                            action_list.push({
                                "action": 2,
                                "path": path
                            });
                            const delResult = yield this.libsqlClient.execute({
                                sql: "DELETE FROM files WHERE path = ?",
                                args: [path]
                            });
                        }
                        else {
                            if (files.find((f) => f.path === path && (f.timestamp > timestamp))) {
                                console.log('update row:', path, timestamp);
                                action_list.push({
                                    "action": 1,
                                    "path": path
                                });
                                const updateResult = yield this.libsqlClient.execute({
                                    sql: "UPDATE files set timestamp = ? WHERE path = ?",
                                    args: [files.find((f) => f.path === path).timestamp, path]
                                });
                            }
                        }
                    }
                }
            }
            catch (e_5_1) { e_5 = { error: e_5_1 }; }
            finally {
                try {
                    if (!_j && !_a && (_b = _k.return)) yield _b.call(_k);
                }
                finally { if (e_5) throw e_5.error; }
            }
            try {
                for (var _m = true, files_1 = __asyncValues(files), files_1_1; files_1_1 = yield files_1.next(), _d = files_1_1.done, !_d; _m = true) {
                    _f = files_1_1.value;
                    _m = false;
                    const file = _f;
                    if (!result.rows.find((r) => { var _a; return ((_a = r['path']) === null || _a === void 0 ? void 0 : _a.toString()) === file.path; })) {
                        console.log('new row:', file.path, file.timestamp);
                        action_list.push({
                            "action": 0,
                            "path": file.path
                        });
                        const insertResult = yield this.libsqlClient.execute({
                            sql: "INSERT INTO files (path, timestamp) VALUES (?, ?)",
                            args: [file.path, file.timestamp]
                        });
                    }
                }
            }
            catch (e_6_1) { e_6 = { error: e_6_1 }; }
            finally {
                try {
                    if (!_m && !_d && (_e = files_1.return)) yield _e.call(files_1);
                }
                finally { if (e_6) throw e_6.error; }
            }
            return action_list;
        });
        this.run = () => __awaiter(this, void 0, void 0, function* () {
            var _a, e_7, _b, _c;
            const actions = yield this.actionList();
            (0, fs_1.rmSync)(this.input_path, { recursive: true, force: true });
            (0, fs_1.mkdirSync)(this.input_path, { recursive: true });
            console.log('actions:', actions.length);
            let newChangedDocs = false;
            try {
                for (var _d = true, actions_1 = __asyncValues(actions), actions_1_1; actions_1_1 = yield actions_1.next(), _a = actions_1_1.done, !_a; _d = true) {
                    _c = actions_1_1.value;
                    _d = false;
                    const action = _c;
                    if (action.action === 2) {
                        console.log('deleting doc:', action.path);
                        const ids = yield this.getDocIdsForDoc(action.path);
                        if (ids.length > 0) {
                            console.log('deleting doc ids:', ids);
                            yield this.delDocuments(ids);
                        }
                    }
                    else if (action.action === 0 || action.action === 1) {
                        console.log('new/changed doc:', action.path);
                        (0, fs_1.copyFileSync)(action.path, path.join(this.input_path, path.basename(action.path)));
                        newChangedDocs = true;
                    }
                }
            }
            catch (e_7_1) { e_7 = { error: e_7_1 }; }
            finally {
                try {
                    if (!_d && !_a && (_b = actions_1.return)) yield _b.call(actions_1);
                }
                finally { if (e_7) throw e_7.error; }
            }
            if (newChangedDocs) {
                this.emit({ type: 'langchain-run-start', data: {} });
                return this.load().then((docs) => __awaiter(this, void 0, void 0, function* () {
                    this.emit({ type: 'langchain-run-loaded', data: { documents: docs.length } });
                    if (docs.length > 0) {
                        this.emit({ type: 'langchain-run-splitting', data: { documents: docs.length } });
                        const chunks = yield this.split(docs);
                        this.emit({ type: 'langchain-run-split', data: { chunks: chunks.length } });
                        if (chunks.length > 0) {
                            this.emit({ type: 'langchain-run-adding', data: { chunks: chunks.length } });
                            return this.addDocuments(chunks).then(() => {
                                this.emit({ type: 'langchain-run-complete', data: { documents: docs.length, chunks: chunks.length } });
                                console.log('Langchain run completed');
                                return { status: 'completed', documents: docs.length, chunks: chunks.length };
                            }).catch((err) => {
                                console.error('addDocuments error:', err);
                                this.emit({ type: 'langchain-run-error', data: { message: err } });
                                return { status: 'error', message: err };
                            });
                        }
                        else {
                            this.emit({ type: 'langchain-run-error', data: { message: 'no chunks created' } });
                            return { status: 'error', message: 'no chunks created' };
                        }
                    }
                    else {
                        this.emit({ type: 'langchain-run-error', data: { message: 'no documents loaded' } });
                        return { status: 'error', message: 'no documents loaded' };
                    }
                })).catch((err) => {
                    console.error('load error:', err);
                    return { status: 'error', message: err };
                });
            }
            else {
                console.log('No new or changed documents, skipping ingestion');
                return { status: 'completed', documents: 0, chunks: 0 };
            }
        });
        this.doc_path = doc_path;
        (0, fs_1.mkdirSync)(path.join(db_dir, 'sql'), { recursive: true });
        this.db_path = path.join(db_dir, 'sql', 'sqlite.db');
        this.input_path = path.join(db_dir, '_input');
        (0, fs_1.mkdirSync)(this.input_path, { recursive: true });
        console.log('db_path:', this.db_path);
        console.log('input_path:', this.input_path);
        console.log('doc_path:', this.doc_path);
        const firstTime = !(0, fs_1.existsSync)(this.db_path);
        this.libsqlClient = (0, client_1.createClient)({
            url: "file:" + this.db_path,
        });
        this.createDBArtifacts(firstTime);
        this.embeddings = new ollama_1.OllamaEmbeddings({
            model,
            baseUrl
        });
        this.vectorStore = this.getNewVectorStore();
        console.log('LangchainService initialized');
    }
}
exports.default = LangchainService;
//# sourceMappingURL=LangchainService.js.map
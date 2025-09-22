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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
const unzipper_1 = __importDefault(require("unzipper"));
const child_process_1 = require("child_process");
const ollama_1 = require("ollama");
class OllamaService {
    constructor(assetsFolderPath, appDataPath) {
        this.archivePath = '';
        this.isReady = false;
        this.register = (webContents) => {
            this.webContents = webContents;
            electron_1.ipcMain.on('ollama', (event, arg) => __awaiter(this, void 0, void 0, function* () {
                const { callbackId, command, params } = arg;
                console.log('ollama:', callbackId, command, params);
                let response = {};
                switch (command) {
                    case "isRunning":
                        {
                            try {
                                this.ollama = new ollama_1.Ollama({ host: 'http://127.0.0.1:11434' });
                                response = yield this.ollama.ps();
                                this.isReady = true;
                            }
                            catch (e) {
                                this.isReady = false;
                                this.ollama = undefined;
                            }
                            response = { isReady: this.isReady };
                        }
                        break;
                    case "isReady":
                        {
                            response = { isReady: this.isReady };
                        }
                        break;
                    case "start":
                        {
                            response = this.start();
                        }
                        break;
                    case "stop":
                        {
                            response = this.stop();
                        }
                        break;
                    case "generate":
                        {
                            response = yield this.generate(params);
                        }
                        break;
                    case "pull":
                        {
                            response = yield this.pull(params);
                        }
                        break;
                    case "rm":
                        {
                            response = yield this.rm(params);
                        }
                        break;
                    case "list":
                        {
                            response = yield this.list();
                        }
                        break;
                    case "show":
                        {
                            response = yield this.show(params);
                        }
                        break;
                    case "ps":
                        {
                            response = yield this.ps();
                        }
                        break;
                    case "abort":
                        {
                            this.abort();
                        }
                        break;
                    default: {
                        response = { error: 'unknown command' };
                    }
                }
                response.command = command;
                response.params = params;
                event.reply('reply', {
                    callbackId,
                    response: JSON.stringify(response)
                });
            }));
        };
        this.emit = (args) => {
            var _a;
            // const ev: any = JSON.parse(args);
            // console.log('event:', ev);
            (_a = this.webContents) === null || _a === void 0 ? void 0 : _a.send('event', {
                response: args
            });
        };
        this.extract = () => {
            if (!fs.existsSync(this.unzipPath)) {
                console.log("Extracting ollama files...", this.unzipPath);
                fs.mkdirSync(this.unzipPath, { recursive: true });
                fs.createReadStream(this.archivePath)
                    .pipe(unzipper_1.default.Extract({ path: this.unzipPath }))
                    .on("close", () => {
                    console.log("Files unzipped successfully");
                    this.emit({ type: 'ollama-extract-done', data: this.unzipPath });
                });
            }
        };
        this.start = () => {
            try {
                this.ollamaProcess = (0, child_process_1.spawn)('ollama-serve.bat', {
                    shell: true,
                    cwd: this.unzipPath,
                    stdio: ['pipe', 'pipe', 'pipe']
                });
                if (this.ollamaProcess) {
                    this.ollamaProcess.stdout.on('data', (data) => {
                        console.log(`stdout: ${data}`);
                        // Send event
                        this.emit({ type: 'ollama-stdout', data: Buffer.from(data).toString() });
                    });
                    this.ollamaProcess.stderr.on("data", (data) => {
                        console.error(`stderr: ${data}`);
                        // Send event
                        this.emit({ type: 'ollama-stderr', data: Buffer.from(data).toString() });
                    });
                    this.ollamaProcess.on('exit', (code) => {
                        console.log(`Ollama process ended with ${code}`);
                        // Send event
                        this.emit({ type: 'ollama-ended', data: code ? code.toString() : '0' });
                    });
                    setTimeout(() => {
                        this.ollama = new ollama_1.Ollama({ host: 'http://127.0.0.1:11434' });
                        // event Ollama connection is ready
                        this.isReady = true;
                        this.emit({ type: 'ollama-ready', data: 'ok' });
                    }, 5000);
                }
                else {
                    console.error('No valid process for Ollama!');
                }
                return { status: 'starting' };
            }
            catch (e) {
                console.error('Ollama start error:', e);
                return { status: 'error', error: e };
            }
        };
        this.stop = () => {
            if (this.ollamaProcess) {
                this.ollamaProcess.kill();
            }
            else {
                console.error('No valid process for Ollama!');
            }
            return { status: 'stopping' };
        };
        this.generate = (request) => {
            return this.ollama ? this.ollama.generate(request) : Promise.reject('no service');
        };
        this.pull = (request) => __awaiter(this, void 0, void 0, function* () {
            var _a, e_1, _b, _c;
            if (this.ollama) {
                const stream = yield this.ollama.pull(request);
                let currentDigestDone = false;
                console.log('pulling started model:', request.model);
                this.emit({ type: 'ollama-pull-start', data: { model: request.model, percent: 0 } });
                try {
                    for (var _d = true, stream_1 = __asyncValues(stream), stream_1_1; stream_1_1 = yield stream_1.next(), _a = stream_1_1.done, !_a; _d = true) {
                        _c = stream_1_1.value;
                        _d = false;
                        const part = _c;
                        if (part.digest) {
                            let percent = 0;
                            if (part.completed && part.total) {
                                percent = Math.round((part.completed / part.total) * 100);
                            }
                            // console.log(`${part.status} ${percent}%...`)
                            this.emit({ type: 'ollama-pull-progress', data: { model: request.model, percent } });
                            if (percent === 100 && !currentDigestDone) {
                                this.emit({ type: 'ollama-pull-complete', data: { model: request.model, percent } });
                            }
                            else {
                                currentDigestDone = false;
                            }
                        }
                        else {
                            console.log(part.status);
                            this.emit({ type: 'ollama-pull-part', data: { model: request.model, partStatus: part.status } });
                        }
                    }
                }
                catch (e_1_1) { e_1 = { error: e_1_1 }; }
                finally {
                    try {
                        if (!_d && !_a && (_b = stream_1.return)) yield _b.call(stream_1);
                    }
                    finally { if (e_1) throw e_1.error; }
                }
                console.log('pulling done model:', request.model);
                this.emit({ type: 'ollama-pull-done', data: { model: request.model } });
                return {
                    model: request.model,
                    status: 'ollama-pull-done',
                };
            }
            else {
                Promise.reject('no service');
            }
        });
        this.rm = (request) => {
            return this.ollama ? this.ollama.delete(request) : Promise.reject('no service');
        };
        this.list = () => {
            return this.ollama ? this.ollama.list() : Promise.reject('no service');
        };
        this.show = (request) => {
            return this.ollama ? this.ollama.show(request) : Promise.reject('no service');
        };
        this.ps = () => {
            return this.ollama ? this.ollama.ps() : Promise.reject('no service');
        };
        this.abort = () => {
            if (this.ollama) {
                this.ollama.abort();
            }
        };
        this.unzipPath = path.join(appDataPath, 'ollama');
        if (process.platform === 'win32') {
            this.archivePath = path.join(assetsFolderPath, 'ollama-win.zip');
        }
        else if (process.platform === 'darwin') {
            this.archivePath = path.join(assetsFolderPath, 'ollama-darwin.zip');
        }
    }
}
exports.default = OllamaService;
//# sourceMappingURL=OllamaService.js.map
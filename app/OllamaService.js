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
const tree_kill_1 = __importDefault(require("tree-kill"));
const find_process_1 = __importDefault(require("find-process"));
const ollama_1 = require("ollama");
const SystemInfo_1 = require("./SystemInfo");
const child_process_1 = require("child_process");
class OllamaService {
    constructor(assetsFolderPath, appDataPath, gpuBrands) {
        this.archivePath = '';
        this.archiveNoGPUPath = '';
        this.isReady = false;
        this.ollamaExecutable = '';
        this.ollamaArgs = [];
        this.ollamaNoGPUArgs = [];
        this.isExtracting = false;
        this.ollamaPID = -1;
        this.register = (webContents) => {
            this.webContents = webContents;
            electron_1.ipcMain.on('ollama', (event, arg) => __awaiter(this, void 0, void 0, function* () {
                const { callbackId, command, params } = arg;
                console.log('ollama:', callbackId, command, params);
                let response = {};
                try {
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
                                if (this.isExtracting) {
                                    response = { status: 'error', error: 'extraction' };
                                }
                                else {
                                    response = this.start(params.gpuAccel);
                                }
                            }
                            break;
                        case "stop":
                            {
                                response = this.stop();
                            }
                            break;
                        case "find":
                            {
                                response = yield this.findOllama();
                            }
                            break;
                        case "generate":
                            {
                                response = yield this.generate(params);
                            }
                            break;
                        case "chat":
                            {
                                response = yield this.chat(params);
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
                        case "gpuAccel":
                            {
                                const { gpuAcceleration } = params;
                                this.emit({ type: 'ollama-gpu-accel-started', data: { from: this.archivePath } });
                                let archivePath = this.archivePath;
                                let unzipPath = this.unzipPath;
                                yield this.stop();
                                if (!gpuAcceleration) {
                                    archivePath = this.archiveNoGPUPath;
                                    unzipPath = unzipPath + '-nogpu';
                                    if (!fs.existsSync(unzipPath)) {
                                        fs.mkdirSync(unzipPath, { recursive: true });
                                        fs.createReadStream(archivePath)
                                            .pipe(unzipper_1.default.Extract({ path: unzipPath }))
                                            .on("close", () => {
                                            console.log("Files unzipped successfully");
                                            this.emit({ type: 'ollama-gpu-accel-done', data: { from: archivePath, to: unzipPath } });
                                        });
                                    }
                                    else {
                                        this.emit({ type: 'ollama-gpu-accel-done', data: { from: archivePath, to: unzipPath } });
                                    }
                                }
                                else {
                                    this.emit({ type: 'ollama-gpu-accel-done', data: { from: archivePath, to: unzipPath } });
                                }
                                response = { status: 'ok', data: 'gpu-accel-change' };
                                // TODO: startup is DIFFERENT FOR GPU AND NON GPU ACCEL MUST SAVE TO ENVIRONMENT!
                            }
                            break;
                        default: {
                            response = { error: 'unknown command' };
                        }
                    }
                }
                catch (e) {
                    console.error(e);
                    response.error = e;
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
        this.findOllama = () => __awaiter(this, void 0, void 0, function* () {
            const processes = yield (0, find_process_1.default)('port', '11434');
            if (processes.length === 0) {
                console.error('Cannot find Ollama process:', processes);
            }
            else {
                this.ollamaPID = processes[0].pid;
            }
            return {
                ollamaPID: this.ollamaPID
            };
        });
        this.delay = (ms) => {
            return new Promise((resolve) => {
                setTimeout(resolve, ms);
            });
        };
        this.extract = () => __awaiter(this, void 0, void 0, function* () {
            console.log('extract:', this.archivePath, '=>', this.unzipPath);
            this.emit({ type: 'ollama-extract-config', data: { from: this.archivePath, to: this.unzipPath } });
            // Wait until the archivePath exists as on a very slow PC this could take a little time
            while (!fs.existsSync(this.archivePath)) {
                console.log("extract:error:cannot find", this.archivePath);
                this.emit({ type: 'ollama-extract-error-archive-not-found-retrying', data: { from: this.archivePath, to: this.unzipPath } });
                yield this.delay(2000);
            }
            this.emit({ type: 'ollama-extract-checking', data: { from: this.archivePath, to: this.unzipPath } });
            if (!fs.existsSync(this.unzipPath)) {
                this.isExtracting = true;
                this.emit({ type: 'ollama-extract-starting', data: { from: this.archivePath, to: this.unzipPath } });
                console.log("Extracting ollama files...", this.unzipPath);
                fs.mkdirSync(this.unzipPath, { recursive: true });
                fs.createReadStream(this.archivePath)
                    .pipe(unzipper_1.default.Extract({ path: this.unzipPath }))
                    .on("close", () => {
                    console.log("Files unzipped successfully");
                    this.emit({ type: 'ollama-extract-done', data: this.unzipPath });
                    this.isExtracting = false;
                });
            }
            else {
                console.log("extract:skipping:", this.unzipPath);
                this.emit({ type: 'ollama-extract-skipping', data: { from: this.archivePath, to: this.unzipPath } });
            }
        });
        this.start = (gpuAccel = false) => {
            try {
                let args = this.ollamaArgs;
                let unzipPath = this.unzipPath;
                let ollamaExecutable = this.ollamaExecutable;
                if (!gpuAccel) {
                    ollamaExecutable = 'ollama.exe';
                    args = this.ollamaNoGPUArgs;
                    unzipPath = this.unzipPath + '-nogpu';
                }
                const command = path.join(unzipPath, ollamaExecutable);
                console.log('execFile:', gpuAccel, command, args);
                this.emit({ type: 'ollama-start', data: { command, args } });
                this.ollamaProcess = (0, child_process_1.spawn)(ollamaExecutable, args, {
                    shell: true,
                    cwd: unzipPath,
                    stdio: ['ignore', 'pipe', 'pipe'],
                    windowsHide: true
                });
                if (this.ollamaProcess) {
                    this.ollamaProcess.on('spawn', () => __awaiter(this, void 0, void 0, function* () {
                        yield this.findOllama();
                        console.log(`Ollama process started ${this.ollamaPID}`);
                        // Send event
                        this.emit({ type: 'ollama-started', data: 'ok' });
                        setTimeout(() => {
                            this.ollama = new ollama_1.Ollama({ host: 'http://127.0.0.1:11434' });
                            // event Ollama connection is ready
                            this.isReady = true;
                            this.emit({ type: 'ollama-ready', data: 'ok' });
                        }, 5000);
                    }));
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
                        console.log(`Ollama process exited with ${code}`);
                        // Send event
                        this.emit({ type: 'ollama-ended', data: code ? code.toString() : '0' });
                    });
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
            if (this.ollamaPID > -1) {
                console.error(`Sending terminate signal to Ollama ${this.ollamaPID}!`);
                (0, tree_kill_1.default)(this.ollamaPID, (error) => {
                    console.error('error to sending kill to Ollama:', error);
                });
            }
            return { status: 'stopping' };
        };
        this.generate = (request) => __awaiter(this, void 0, void 0, function* () {
            var _a, e_1, _b, _c;
            if (this.ollama) {
                this.emit({ type: 'ollama-generate-start', data: { prompt: request.prompt } });
                try {
                    const result = yield this.ollama.generate(request);
                    let response = '';
                    try {
                        for (var _d = true, result_1 = __asyncValues(result), result_1_1; result_1_1 = yield result_1.next(), _a = result_1_1.done, !_a; _d = true) {
                            _c = result_1_1.value;
                            _d = false;
                            const part = _c;
                            console.log(part.response);
                            response += part.response;
                        }
                    }
                    catch (e_1_1) { e_1 = { error: e_1_1 }; }
                    finally {
                        try {
                            if (!_d && !_a && (_b = result_1.return)) yield _b.call(result_1);
                        }
                        finally { if (e_1) throw e_1.error; }
                    }
                    this.emit({ type: 'ollama-generate-complete', data: { prompt: request.prompt, response } });
                    return response;
                }
                catch (e) {
                    this.emit({ type: 'ollama-generate-error', error: e });
                    return '';
                }
            }
            return Promise.reject('no service');
        });
        this.chat = (request) => __awaiter(this, void 0, void 0, function* () {
            var _a, e_2, _b, _c;
            if (this.ollama) {
                try {
                    this.emit({ type: 'ollama-thinking-start', data: { prompt: request.prompt } });
                    const response = yield this.ollama.chat(request);
                    let startedThinking = false;
                    let finishedThinking = false;
                    let answer = '';
                    try {
                        for (var _d = true, response_1 = __asyncValues(response), response_1_1; response_1_1 = yield response_1.next(), _a = response_1_1.done, !_a; _d = true) {
                            _c = response_1_1.value;
                            _d = false;
                            const chunk = _c;
                            if (chunk.message.thinking && !startedThinking) {
                                startedThinking = true;
                                process.stdout.write('Thinking:\n========\n\n');
                            }
                            else if (chunk.message.content && startedThinking && !finishedThinking) {
                                finishedThinking = true;
                                process.stdout.write('\n\nResponse:\n========\n\n');
                                this.emit({ type: 'ollama-thinking-answer', data: { chunk: chunk.message.content } });
                                answer += chunk.message.content;
                            }
                            if (chunk.message.thinking) {
                                process.stdout.write(chunk.message.thinking);
                            }
                            else if (chunk.message.content) {
                                process.stdout.write(chunk.message.content);
                                this.emit({ type: 'ollama-thinking-content', data: { chunk: chunk.message.content } });
                            }
                        }
                    }
                    catch (e_2_1) { e_2 = { error: e_2_1 }; }
                    finally {
                        try {
                            if (!_d && !_a && (_b = response_1.return)) yield _b.call(response_1);
                        }
                        finally { if (e_2) throw e_2.error; }
                    }
                    return answer;
                }
                catch (e) {
                    this.emit({ type: 'ollama-thinking-error', error: e });
                    return '';
                }
            }
            else {
                return Promise.reject('no service');
            }
        });
        this.pull = (request) => __awaiter(this, void 0, void 0, function* () {
            var _a, e_3, _b, _c;
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
                catch (e_3_1) { e_3 = { error: e_3_1 }; }
                finally {
                    try {
                        if (!_d && !_a && (_b = stream_1.return)) yield _b.call(stream_1);
                    }
                    finally { if (e_3) throw e_3.error; }
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
        if (SystemInfo_1.isWindows) {
            if (gpuBrands.find(f => f.toLowerCase().startsWith('nvidia'))) {
                console.log('ollama choice: nvidia: win');
                this.archivePath = path.join(assetsFolderPath, 'ollama-win.zip');
                this.archiveNoGPUPath = path.join(assetsFolderPath, 'ollama-win.zip');
                this.ollamaExecutable = 'ollama.exe';
                this.ollamaArgs = ['serve'];
                this.ollamaNoGPUArgs = ['serve'];
            }
            else if (gpuBrands.find(f => f.toLowerCase().startsWith('amd'))) {
                console.log('ollama choice: amd: win');
                this.archivePath = path.join(assetsFolderPath, 'ollama-rocm-win.zip');
                this.archiveNoGPUPath = path.join(assetsFolderPath, 'ollama-win.zip');
                this.ollamaExecutable = 'ollama.exe';
                this.ollamaArgs = ['serve'];
                this.ollamaNoGPUArgs = ['serve'];
            }
            else if (gpuBrands.find(f => f.toLowerCase().startsWith('intel'))) {
                console.log('ollama choice: ipex: win');
                this.archivePath = path.join(assetsFolderPath, 'ollama-ipex-llm-win.zip');
                this.archiveNoGPUPath = path.join(assetsFolderPath, 'ollama-win.zip');
                this.ollamaNoGPUArgs = ['serve'];
                this.ollamaExecutable = 'ollama-serve.bat';
            }
            else {
                console.log('ollama choice: nogpu: win');
                this.archivePath = path.join(assetsFolderPath, 'ollama-win.zip');
                this.archiveNoGPUPath = path.join(assetsFolderPath, 'ollama-win.zip');
                this.ollamaExecutable = 'ollama.exe';
                this.ollamaNoGPUArgs = ['serve'];
                this.ollamaArgs = ['serve'];
            }
        }
        else if (SystemInfo_1.isMac) {
            console.log('ollama choice: darwin');
            this.archivePath = path.join(assetsFolderPath, 'ollama-darwin.zip');
            this.archiveNoGPUPath = path.join(assetsFolderPath, 'ollama-darwin.zip');
            this.ollamaExecutable = 'ollama-darwin';
            this.ollamaArgs = ['serve'];
            this.ollamaNoGPUArgs = ['serve'];
        }
    }
}
exports.default = OllamaService;
//# sourceMappingURL=OllamaService.js.map
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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.emitter = void 0;
const electron_1 = require("electron");
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
const unzipper_1 = __importDefault(require("unzipper"));
const child_process_1 = require("child_process");
const ollama_1 = require("ollama");
const events_1 = __importDefault(require("events"));
exports.emitter = new events_1.default();
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
                    case "hasStarted":
                        {
                            response = this.ollamaProcess ? true : false;
                        }
                        break;
                    case "isReady":
                        {
                            response = this.isReady;
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
                            response = this.abort();
                        }
                        break;
                    default: {
                        response = { error: 'unknown command' };
                    }
                }
                event.reply('reply', {
                    callbackId,
                    response: JSON.stringify(response)
                });
            }));
        };
        this.emit = (args) => {
            exports.emitter.emit('event', JSON.stringify(args));
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
            this.ollamaProcess = (0, child_process_1.spawn)(path.join(this.unzipPath, 'ollama-serve.bat'));
            if (this.ollamaProcess) {
                this.ollamaProcess.stdout.on('data', (data) => {
                    console.log(`stdout:\n${data}`);
                    // Send event
                    this.emit({ type: 'ollama-stdout', data: data.toString() });
                });
                this.ollamaProcess.stderr.on("data", (data) => {
                    console.error(`stderr: ${data}`);
                    // Send event
                    this.emit({ type: 'ollama-stderr', data: data.toString() });
                });
                this.ollamaProcess.on('exit', (code) => {
                    console.log(`Ollama process ended with ${code}`);
                    // Send event
                    exports.emitter.emit('event', { type: 'ollama-ended', data: code === null || code === void 0 ? void 0 : code.toString() });
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
        };
        this.stop = () => {
            if (this.ollamaProcess) {
                this.ollamaProcess.kill();
            }
            else {
                console.error('No valid process for Ollama!');
            }
        };
        this.generate = (request) => {
            return this.ollama ? this.ollama.generate(request) : Promise.reject('no service');
        };
        this.pull = (request) => {
            return this.ollama ? this.ollama.pull(request) : Promise.reject('no service');
        };
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
        exports.emitter.on('event', (args) => {
            var _a;
            try {
                const ev = JSON.parse(args);
                console.log('event:', ev);
                (_a = this.webContents) === null || _a === void 0 ? void 0 : _a.send('event', {
                    response: args
                });
            }
            catch (e) {
                console.error(e);
            }
        });
    }
}
exports.default = OllamaService;
//# sourceMappingURL=OllamaService.js.map
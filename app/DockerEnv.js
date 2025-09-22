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
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
const key_value_file_1 = require("key-value-file");
class DockerEnv {
    constructor(appConfigPath, assetsFolderPath, userHomePath, userDataPath, userTempPath, sep, docPathsCB) {
        this.register = () => {
            electron_1.ipcMain.on('env', (event, arg) => __awaiter(this, void 0, void 0, function* () {
                var _a, _b, _c, _d;
                const { callbackId, command, params } = arg;
                console.log('env:', callbackId, command, params);
                let response = {};
                switch (command) {
                    case "get":
                        {
                            response = yield ((_b = (_a = this.kvFile) === null || _a === void 0 ? void 0 : _a.get(params.key)) === null || _b === void 0 ? void 0 : _b.toString());
                        }
                        break;
                    case "set":
                        {
                            response = yield ((_c = this.kvFile) === null || _c === void 0 ? void 0 : _c.set(params.key, params.value));
                        }
                        break;
                    case "write":
                        {
                            response = yield ((_d = this.kvFile) === null || _d === void 0 ? void 0 : _d.writeFile());
                        }
                        break;
                }
                event.reply('reply', {
                    callbackId,
                    response: JSON.stringify(response)
                });
            }));
        };
        this.setDocSourcePath = (dsp) => {
            this.dsp = dsp;
            this.generateEnvFile();
        };
        this.setEmbeddingsModelName = (ellm) => {
            this.ellm = ellm;
            this.generateEnvFile();
        };
        this.setModelName = (llm) => {
            this.llm = llm;
            this.generateEnvFile();
        };
        this.getDocSourcePath = () => {
            return this.dsp ? this.dsp : this.userDataPath;
        };
        this.getEmbeddingsModelName = () => {
            return this.ellm;
        };
        this.getModelName = () => {
            return this.llm;
        };
        this.generateEnvFile = () => {
            let envTemplate = fs.readFileSync(path.join(this.assetsFolderPath, 'template.env'), 'utf8');
            envTemplate = envTemplate.replace(new RegExp('#DOC_ROOT_PATH#', 'g'), this.dsp ? this.dsp : '');
            envTemplate = envTemplate.replace(new RegExp('#EMBEDDINGS_MODEL_NAME#', 'g'), this.ellm ? this.ellm : '');
            envTemplate = envTemplate.replace(new RegExp('#LLM_MODEL_NAME#', 'g'), this.llm ? this.llm : '');
            envTemplate = envTemplate.replace(new RegExp('#TEMP#', 'g'), this.userTempPath);
            envTemplate = envTemplate.replace(new RegExp('#USER_DATA_HOME#', 'g'), this.userDataPath);
            envTemplate = envTemplate.replace(new RegExp('#SEP#', 'g'), this.sep);
            return this.writeEnvFile(envTemplate).then((kvFile) => {
                this.kvFile = kvFile;
                return envTemplate;
            });
        };
        this.writeEnvFile = (data) => {
            fs.writeFileSync(this.sourceEnvPath, data);
            return (0, key_value_file_1.parseFile)(this.sourceEnvPath);
        };
        this.appConfigPath = appConfigPath;
        this.assetsFolderPath = assetsFolderPath;
        this.userHomePath = userHomePath;
        this.userDataPath = sep === '\\' ? userDataPath.replace(new RegExp('\\\\', 'g'), '\\\\') : userDataPath;
        this.userTempPath = sep === '\\' ? userTempPath.replace(new RegExp('\\\\', 'g'), '\\\\') : userTempPath;
        this.sep = sep === '\\' ? '\\\\' : sep;
        this.docPathsCB = docPathsCB;
        if (!fs.existsSync(this.appConfigPath)) {
            fs.mkdirSync(this.appConfigPath, { recursive: true });
        }
        this.sourceEnvPath = path.join(appConfigPath, '.env');
        // Read the .env and set dsp, ellm, llm
        console.log('DockerEnv:constructor:read:', this.sourceEnvPath);
        (0, key_value_file_1.parseFile)(this.sourceEnvPath).then((kv) => {
            var _a, _b, _c, _d;
            const dp = (_a = kv.get('ROOT_DATA_PATH')) === null || _a === void 0 ? void 0 : _a.toString();
            this.dsp = (_b = kv.get('DOC_SOURCE_PATH')) === null || _b === void 0 ? void 0 : _b.toString();
            this.docPathsCB(this.dsp, dp);
            this.ellm = (_c = kv.get('EMBEDDINGS_MODEL_NAME')) === null || _c === void 0 ? void 0 : _c.toString();
            this.llm = (_d = kv.get('LLM_MODEL_NAME')) === null || _d === void 0 ? void 0 : _d.toString();
            this.kvFile = kv;
        }).catch((reason) => __awaiter(this, void 0, void 0, function* () {
            var _a, _b;
            this.dsp = path.join(this.userHomePath, 'lrag').replace(new RegExp('\\\\', 'g'), '\\\\');
            this.ellm = "embeddinggemma:300m";
            this.llm = "gemma3:1b";
            this.generateEnvFile();
            this.kvFile = yield (0, key_value_file_1.parseFile)(this.sourceEnvPath);
            const dp = (_a = this.kvFile.get('ROOT_DATA_PATH')) === null || _a === void 0 ? void 0 : _a.toString();
            this.dsp = (_b = this.kvFile.get('DOC_SOURCE_PATH')) === null || _b === void 0 ? void 0 : _b.toString();
            this.docPathsCB(this.dsp, dp);
        }));
    }
}
exports.default = DockerEnv;
//# sourceMappingURL=DockerEnv.js.map
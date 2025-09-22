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
class LRagFiles {
    constructor(docPath, dataPath) {
        this.register = () => {
            electron_1.ipcMain.on('lragfiles', (event, arg) => __awaiter(this, void 0, void 0, function* () {
                const { callbackId, command, params } = arg;
                const fullPath = path.join(this.docPath, params.name ? params.name : '');
                let response = {};
                switch (command) {
                    case "start":
                        {
                            console.log('LRagFiles:', callbackId, command);
                            if (fs.existsSync(fullPath)) {
                                fs.unlinkSync(fullPath);
                            }
                            response = {
                                fullPath
                            };
                        }
                        break;
                    case "end":
                        {
                            console.log('LRagFiles:', callbackId, command);
                            console.log('written:', fullPath);
                            response = {
                                fullPath
                            };
                        }
                        break;
                    case "chunk":
                        {
                            response = yield (new Promise((resolve, reject) => {
                                try {
                                    fs.appendFile(fullPath, Buffer.from(params.chunk), {
                                        encoding: 'binary',
                                    }, (err) => {
                                        if (err) {
                                            reject({
                                                error: err,
                                                success: false
                                            });
                                        }
                                        resolve({
                                            success: true
                                        });
                                    });
                                }
                                catch (e) {
                                    reject({
                                        error: e,
                                        success: false
                                    });
                                }
                            }));
                        }
                        break;
                    case "ls":
                        {
                            console.log('LRagFiles:', callbackId, command);
                            response = fs.readdirSync(fullPath);
                        }
                        break;
                    case "rm":
                        {
                            console.log('LRagFiles:', callbackId, command);
                            try {
                                fs.unlinkSync(fullPath);
                                response = {
                                    success: true
                                };
                            }
                            catch (e) {
                                response = {
                                    error: e,
                                    success: false
                                };
                            }
                        }
                        break;
                    case "cleanData":
                        {
                            console.log('LRagFiles:clean:removing:', callbackId, this.dataPath);
                            try {
                                fs.rmSync(this.dataPath, {
                                    recursive: true,
                                    force: true
                                });
                                fs.rmSync(this.docPath, {
                                    recursive: true,
                                    force: true
                                });
                                fs.mkdirSync(this.docPath, { recursive: true });
                                response = {
                                    success: true
                                };
                            }
                            catch (e) {
                                response = {
                                    error: e,
                                    success: false
                                };
                            }
                        }
                        break;
                }
                event.reply('reply', {
                    callbackId,
                    response: JSON.stringify(response)
                });
            }));
        };
        console.log('LRagFiles:constructor:');
        if (docPath) {
            this.docPath = docPath;
            fs.mkdirSync(this.docPath, { recursive: true });
        }
        else {
            this.docPath = '';
        }
        this.dataPath = dataPath ? dataPath : '';
        console.log('LRagFiles:', this.docPath, this.dataPath);
    }
}
exports.default = LRagFiles;
//# sourceMappingURL=LragFiles.js.map
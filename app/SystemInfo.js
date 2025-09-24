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
exports.isLinux = exports.isWindows = exports.isMac = void 0;
const electron_1 = require("electron");
const systeminformation_1 = require("systeminformation");
const nodeDiskInfo = __importStar(require("node-disk-info"));
const os_1 = require("os");
exports.isMac = (0, os_1.platform)() === "darwin";
exports.isWindows = (0, os_1.platform)() === "win32";
exports.isLinux = (0, os_1.platform)() === "linux";
class SystemInfo {
    constructor() {
        this.getGraphics = () => __awaiter(this, void 0, void 0, function* () {
            this.graphics = yield (0, systeminformation_1.graphics)();
            return this.graphics;
        });
        this.register = () => {
            electron_1.ipcMain.on('system', (event, arg) => __awaiter(this, void 0, void 0, function* () {
                const { callbackId, command, params } = arg;
                console.log('system:', callbackId, command, params);
                let response = {};
                switch (command) {
                    case "mem":
                        {
                            response = yield (0, systeminformation_1.mem)();
                        }
                        break;
                    case "cpu":
                        {
                            response = yield (0, systeminformation_1.cpu)();
                        }
                        break;
                    case "disks":
                        {
                            response = nodeDiskInfo.getDiskInfoSync();
                        }
                        break;
                    case "os":
                        {
                            response = this.getOsTypes();
                        }
                        break;
                    default:
                        response = this.graphics;
                }
                event.reply('reply', {
                    callbackId,
                    response: JSON.stringify(response)
                });
            }));
        };
        this.getOsTypes = () => {
            return {
                isMac: exports.isMac,
                isWindows: exports.isWindows,
                isLinux: exports.isLinux
            };
        };
    }
}
exports.default = SystemInfo;
//# sourceMappingURL=SystemInfo.js.map
"use strict";
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
class ContextChat {
    constructor(langchainService, ollamaService) {
        this.prompt = '';
        this.context = '';
        this.register = () => {
            electron_1.ipcMain.on('chat', (event, arg) => __awaiter(this, void 0, void 0, function* () {
                const { callbackId, command, params } = arg;
                console.log('chat:', callbackId, command, params);
                let response = {};
                switch (command) {
                    case "question":
                        {
                            response = yield this.getAnswer(params);
                        }
                        break;
                }
                event.reply('reply', {
                    callbackId,
                    response: JSON.stringify(response)
                });
            }));
        };
        this.getAnswer = (options) => __awaiter(this, void 0, void 0, function* () {
            if (!this.vectorStore || !this.ollamaService.isReady) {
                return 'Services not ready';
            }
            if (options.think) {
                return this.ollamaService.chat(options);
            }
            else {
                return this.ollamaService.generate(options);
            }
        });
        this.vectorStore = langchainService.getVectorStore();
        this.libsqlClient = langchainService.getSqlClient();
        this.ollamaService = ollamaService;
    }
}
exports.default = ContextChat;
//# sourceMappingURL=ContextChat.js.map
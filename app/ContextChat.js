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
var __asyncValues = (this && this.__asyncValues) || function (o) {
    if (!Symbol.asyncIterator) throw new TypeError("Symbol.asyncIterator is not defined.");
    var m = o[Symbol.asyncIterator], i;
    return m ? m.call(o) : (o = typeof __values === "function" ? __values(o) : o[Symbol.iterator](), i = {}, verb("next"), verb("throw"), verb("return"), i[Symbol.asyncIterator] = function () { return this; }, i);
    function verb(n) { i[n] = o[n] && function (v) { return new Promise(function (resolve, reject) { v = o[n](v), settle(resolve, reject, v.done, v.value); }); }; }
    function settle(resolve, reject, d, v) { Promise.resolve(v).then(function(v) { resolve({ value: v, done: d }); }, reject); }
};
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const prompts_1 = require("@langchain/core/prompts");
const output_parsers_1 = require("@langchain/core/output_parsers");
const ollama_1 = require("@langchain/ollama");
const combineDocuments = (docs) => {
    return docs.map((doc) => `Content: ${doc.pageContent} (Source: ${doc.metadata}`).join('\n\n');
};
class ContextChat {
    constructor(langchainService, ollamaService) {
        this.prompt = '';
        this.context = '';
        this.emit = (args) => {
            var _a;
            (_a = this.webContents) === null || _a === void 0 ? void 0 : _a.send('chat', {
                response: args
            });
        };
        this.register = (webContents) => {
            this.webContents = webContents;
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
            var _a, e_1, _b, _c;
            if (!this.ollamaService.isReady || !this.ollamaService.ollama) {
                return 'Services not ready';
            }
            try {
                this.ollamaLlm = new ollama_1.Ollama({
                    baseUrl: "http://localhost:11434",
                    model: options.model
                });
                const vectorStore = yield this.langchainService.getUSearch();
                const contextualizedQuestionPrompt = prompts_1.PromptTemplate.fromTemplate(`
        {contextPrompt}
        chatHistory: {chatHistory}
        question: {userQuestion}  
      `);
                const contextQuestionChain = contextualizedQuestionPrompt
                    .pipe(this.ollamaLlm)
                    .pipe(new output_parsers_1.StringOutputParser())
                    .pipe(vectorStore.asRetriever({
                    k: 3,
                    searchType: "similarity",
                }));
                const documents = yield contextQuestionChain.invoke({
                    contextPrompt: options.contextPrompt,
                    chatHistory: options.chatHistory,
                    userQuestion: options.question
                });
                const combinedDocs = combineDocuments(documents);
                const questionTemplate = prompts_1.PromptTemplate.fromTemplate(`
          {prompt}
          <context>
          {context}
          </context>

          question: {userQuestion}
      `);
                const answerChain = questionTemplate
                    .pipe(this.ollamaLlm)
                    .pipe(new output_parsers_1.StringOutputParser());
                const llmResponse = yield answerChain.stream({
                    prompt: options.prompt,
                    context: combinedDocs,
                    userQuestion: options.question
                });
                let finalAnswer = '';
                try {
                    for (var _d = true, llmResponse_1 = __asyncValues(llmResponse), llmResponse_1_1; llmResponse_1_1 = yield llmResponse_1.next(), _a = llmResponse_1_1.done, !_a; _d = true) {
                        _c = llmResponse_1_1.value;
                        _d = false;
                        const chunk = _c;
                        finalAnswer += chunk;
                        // console.log('chat-chunk', chunk);
                        this.emit({ type: 'chat-chunk', chunk });
                    }
                }
                catch (e_1_1) { e_1 = { error: e_1_1 }; }
                finally {
                    try {
                        if (!_d && !_a && (_b = llmResponse_1.return)) yield _b.call(llmResponse_1);
                    }
                    finally { if (e_1) throw e_1.error; }
                }
                return finalAnswer;
            }
            catch (e) {
                console.error(e);
                return e;
            }
            /*
            if (options.think) {
              return this.ollamaService.chat(options as ChatRequest);
            } else {
              return this.ollamaService.generate(options as GenerateRequest);
            }
            */
        });
        this.langchainService = langchainService;
        this.ollamaService = ollamaService;
    }
}
exports.default = ContextChat;
//# sourceMappingURL=ContextChat.js.map
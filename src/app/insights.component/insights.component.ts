import { Component, NgZone, OnInit, effect, inject, ViewChild, Injector, afterNextRender } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { TranslateModule } from '@ngx-translate/core';
import { SystemService } from '../core/services/system/system.service';
import { EStatus, EWho, ITokenUsage } from '../shared/model';
import {MatInputModule} from '@angular/material/input';
import {MatChipsModule} from '@angular/material/chips';
import {MatProgressSpinnerModule} from '@angular/material/progress-spinner';
import { MatToolbar, MatToolbarModule } from "@angular/material/toolbar";
import { MatIconModule } from '@angular/material/icon';
import {MatProgressBarModule} from '@angular/material/progress-bar';
import {MatGridListModule} from '@angular/material/grid-list';
import {MatListModule} from '@angular/material/list';
import { DomSanitizer } from '@angular/platform-browser';
import { MediaService } from '../core/services/media/media.service';
import { MatTooltip, MatTooltipModule } from '@angular/material/tooltip';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { AlertComponent } from '../alert.component/alert.component';
import { NgxSkeletonLoaderModule } from 'ngx-skeleton-loader';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { BridgeService } from '../core/services';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatSliderModule } from '@angular/material/slider';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatSelectModule } from '@angular/material/select';
import {Clipboard} from '@angular/cdk/clipboard';
import { CommonService } from '../core/services/common-service';
import { OllamaService } from '../core/services/ollama-service';
import { SettingsService } from '../core/services/settings-service';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { IngestComponent } from '../ingest.component/ingest.component';
import { DetailComponent } from '../detail/detail.component';
import { InsightOptionsComponent } from '../insight-options.component/insight-options.component';
import {CdkTextareaAutosize, TextFieldModule} from '@angular/cdk/text-field';

@Component({
  selector: 'app-insights.component',
  imports: [TranslateModule,
    MatButtonModule,
    MatInputModule,
    MatToolbar,
    MatIconModule,
    MatChipsModule,
    MatToolbarModule,
    MatProgressSpinnerModule,
    MatProgressBarModule,
    MatGridListModule,
    MatListModule,
    MatTooltipModule,
    MatDialogModule,
    NgxSkeletonLoaderModule,
    FormsModule,
    MatSliderModule,
    MatExpansionModule,
    MatSelectModule,
    FormsModule,
    ReactiveFormsModule,
    MatSlideToggleModule,
    TextFieldModule
  ],
  templateUrl: './insights.component.html',
  styleUrl: './insights.component.scss'
})
export class InsightsComponent implements OnInit {
  private _injector = inject(Injector);
  
  @ViewChild('autosize') autosize: CdkTextareaAutosize | undefined;
  @ViewChild('modelTip') modelTip: MatTooltip | undefined;
  @ViewChild('historyTip') historyTip: MatTooltip | undefined;
  @ViewChild('titleTip') titleTip: MatTooltip | undefined;

  private _snackBar = inject(MatSnackBar);
  readonly dialog = inject(MatDialog);
  modelUsage: string = '';
  streaming: boolean = false;
  streamedResponse: string = '';
  generationInfo: ITokenUsage | undefined;
  overallStatus: EStatus | undefined;
  insightStatus: EStatus | undefined;
  isDocsOpen = false;
  isModelOpen = false;
  isSettingsOpen = false;
  breakpoint: number = 4;
  useCaseTooltip: string = '';
  showTip: boolean = false;
  
  EStatus: typeof EStatus = EStatus;
  
  constructor(
    private bridgeService: BridgeService,
    public systemService: SystemService,
    public commonService: CommonService,
    public ollamaService: OllamaService,
    public settingsService: SettingsService,
    private sanitizer: DomSanitizer,
    private mediaService: MediaService,
    private ngZone: NgZone,
    private clipboard: Clipboard,
  ) {

    this.bridgeService.chatCallback((ev: any, response: any) => {
      const { type, data } = response;
      // console.log('chat-event:', type);
      this.ngZone.run(() => {
        switch (type) {
          case 'chat-chunk-metadata': {
            // console.log('llmEndData:', data);
            try {
              this.generationInfo = data.llmOutput.tokenUsage as ITokenUsage;
            } catch (e) {
              console.error('Error parsing generation info:', e, data);              
            }
          }
          break;
          case 'chat-chunk': {
            if (response.data) {
              this.streamedResponse += response.data;
              this.scrollToBottom();
            }
          }
          break;
        }
      });
    });

    effect(() => {      
      this.insightStatus = this.systemService.insightStatus.get();
      this.overallStatus = this.systemService.mainStatus.get();
      if (this.overallStatus !== EStatus.running_healthy) {
        this.check();
      }      
    })
  }

  triggerResize = () => {
    // Wait for content to render, then trigger textarea resize.
    afterNextRender(
      () => {
        this.autosize?.resizeToFitContent(true);
   
      },
      {
        injector: this._injector,
      },
    );
  }

  onResize = (event: any) => {
    this.breakpoint = Math.floor(event.target.innerWidth / 300);
  }

  onFocusTip = () => {
    this.showTip = true;
  }

  onBlurTip = () => {
    this.showTip = false;
  }

  formatLabel = (value: number): string => {
    const numberKValue: number = Math.round(value / 1024);
    if (numberKValue <= 8) {
      this.useCaseTooltip = 'PAGES.INSIGHT.USE_CASE.TOOLTIP_1';
    } else if (numberKValue <= 16) {  
      this.useCaseTooltip = 'PAGES.INSIGHT.USE_CASE.TOOLTIP_2';
    } else {
      this.useCaseTooltip = 'PAGES.INSIGHT.USE_CASE.TOOLTIP_3';
    }
    if (this.showTip) {
      this.titleTip?.show();
    }
    return numberKValue + 'k';    
  }

  formatLabelK = (value: number): string => {
    if (value <= 8) {
      this.useCaseTooltip = 'PAGES.INSIGHT.USE_CASE.TOOLTIP_4';
    } else if (value <= 64) {  
      this.useCaseTooltip = 'PAGES.INSIGHT.USE_CASE.TOOLTIP_5';
    } else {
      this.useCaseTooltip = 'PAGES.INSIGHT.USE_CASE.TOOLTIP_6';
    }
    if (this.showTip) {
      this.titleTip?.show();
    }
    return value + '';
  }
  
  async ngOnInit() {
    this.check();
    // this.askQuestion('How are you today?');

    await this.mediaService.createCollection(this.systemService.collection);
    this.systemService.collections = await this.mediaService.getCollections();
    const selectedCollection: any = this.systemService.collections.find(f => f.name === this.systemService.collection).value
    console.log('selected:', selectedCollection);
    this.systemService.selectedCollections.setValue(selectedCollection);
    await this.systemService.refreshFileList(this.mediaService);
    this.systemService.setMaxCtxTokens(this.ollamaService.getModelByName(this.ollamaService.selectedModel).size, this.ollamaService.getModelByName(this.ollamaService.selectedModel).parameter_count);
    console.log('max_ctx_tokens set to:', this.systemService.slow_max_ctx_tokens, this.systemService.fast_max_ctx_tokens);
  }

  check = () => {
    const files: any[] = [];
    this.mediaService.ls((entries: any[]) => { 
      entries.forEach((e: any) => {
        files.push(e);
      })
    }).then((files: any[]) => {
      this.systemService.docsEmpty = (files.length === 0)
    })
  }
  
  getMaxContextTokens = (): number => {
    const llmCtxLength: number = this.ollamaService.getContextLength(this.ollamaService.selectedModel);
    return llmCtxLength > this.systemService.fast_max_ctx_tokens ? this.systemService.fast_max_ctx_tokens : llmCtxLength;
  }

  clearHistory = () => {
    this.ollamaService.resetChatHistory();
    this.ollamaService.useDocContext = false;
  }

  //TODO: When we submit a query perform a ps to get the model usage
  askQuestion = async () => {
    if (this.systemService.question) {
      this.systemService.saveChunkSettings();
      this.systemService.saveInsightSettings();

      const isCSVUseCase: boolean = await this.mediaService.areAllCSV();
      const question: string = this.systemService.question;
      this.systemService.question = '';            

      const me: any = this.ollamaService.getModelByName(this.ollamaService.selectedModel);

      const options: any = {
        baseUrl: this.ollamaService.isCloud() ? "https://ollama.com": "http://localhost:11434",
        useDocContext: this.ollamaService.useDocContext,
        question,
        model: this.ollamaService.selectedModel,
        prompt: this.systemService.userPrompt || await this.commonService.get('PAGES.INSIGHT.PROMPT'),
        contextPrompt: this.systemService.ragPrompt || await this.commonService.get('PAGES.INSIGHT.CONTEXTUAL_PROMPT'),
        chatPrompt: this.systemService.chatPrompt || '{prompt}',
        historyPrompt: await this.commonService.get('PAGES.INSIGHT.HISTORY_PROMPT'),
        chatHistory: this.ollamaService.chatHistory.map(f => f.who === EWho.Assistant ? 'Assistant: ' + f.content : 'User: ' + f.content).join('\n'),
        max_tokens: 256,
        temperature: 0.7,
        top_p: 0.9,
        frequency_penalty: 0,
        presence_penalty: 0,
        stop: ["\n"],
        stream: true,        
        think: this.ollamaService.getThinkingForModel(this.ollamaService.selectedModel),
        k: isCSVUseCase ? 2048  : this.systemService.k,
        mmr: this.systemService.k < 30 && !isCSVUseCase ? true : undefined,
        // numCtx: !me.cloud ? me.context_length: undefined,
        numCtx: isCSVUseCase ? 32000 : this.ollamaService.isCloud() ? undefined : this.systemService.numCtx,
        fileNames: this.systemService.ragFiles.map(e => e.name.replace(/\\/g, '/').replace(/\/\//g, '/'))        
      };
      
      if (this.systemService.filter) {
        options.filter = this.systemService.filter;
      }
      const id: string = this.commonService.generateUUID();

      this.ollamaService.chatHistory.push({
        id,
        who: EWho.User,
        content: question,
        docSources: [],
      });
      this.scrollToBottom();
      this.systemService.insightStatus.update(EStatus.thinking);
      this.streaming = true;
      this.streamedResponse = '';
      const startTime: number = Date.now();
      this.systemService.duration = 0;
      const showTimer = setInterval(() => {
        this.systemService.duration = Date.now() - startTime;        
      }, 2000);
      const questionTimeout = setTimeout(async () => {
        this.dialog.open(
          AlertComponent, {
            data: {
              type: 2,
              params: {
                message: await this.commonService.get('PAGES.INSIGHT.QUERY_TOO_LONG_WARNING')
              }
            }
        });        
      }, 180000)
      const answerResponse: any = await this.systemService.commandInsight('question', options);
      clearInterval(showTimer);
      clearTimeout(questionTimeout);
      const { answer, error, docSources } = answerResponse;
      this.streamedResponse = '';
      this.streaming = false;
      this.systemService.insightStatus.update(EStatus.running);
      // console.log('answerResponse:', answerResponse);
      try {
        if (!error) {
          // console.log('PUSHING ANSWER:', answer);
          if (this.systemService.history.length === 0) {
            setTimeout(() => {
              this.modelTip?.show();
            }, 1000);
          }
          this.ollamaService.chatHistory.push({
            id,
            who: EWho.Assistant,
            content: this.generationInfo ? this.reformat(answer, this.generationInfo.promptTokens, this.generationInfo.completionTokens, this.systemService.duration) : this.reformat(answer, 0, 0, this.systemService.duration),
            // content: answer,
            docSources
          });
          this.systemService.history.unshift({
            id,
            when: new Date(startTime),
            duration: this.systemService.duration,
            q_expanded: false,
            a_expanded: false,
            question,
            answer,
            docContext: this.ollamaService.useDocContext,            
            ingest: {
              embeddings_model: this.ollamaService.embeddings_model,
              ocr_model: this.ollamaService.ocr_model,
              chunkSize: this.systemService.chunkSize,
              overlap: this.systemService.overlap,
              separator: this.systemService.separator,
              useSemantic: this.systemService.useSemantic,
              localVector: this.systemService.localVector,
              collection: this.systemService.collection,
              ocrPrompt: this.systemService.ocrPrompt,
              ocrNumCtx: this.systemService.ocr_num_ctx
            },
            insight: {
              model: this.ollamaService.selectedModel,                            
              k: this.systemService.k,
              filter: this.systemService.filter,
              numCtx: this.systemService.numCtx,
              ragPrompt: this.systemService.ragPrompt,
              userPrompt: this.systemService.userPrompt
            },
            genInfo: this.generationInfo,
            assessment: 0
          })
          this.systemService.duration = 0;
          this.systemService.saveMainHistory();
          this.scrollToBottom();

          // Get the model usage  
          const usageTimer = setInterval(async () => {
            const usage = await this.ollamaService.getRunningModelsUsage();
            if (usage) {
              clearInterval(usageTimer);
              this.modelUsage = usage + ' ';
            }
            if (this.ollamaService.chatHistory.length > 4) {
              this.historyTip?.show();            
            }
          }, 2000);    
        } else {
          this._snackBar.open(await this.commonService.get('PAGES.INSIGHT.LLM_ERROR') + ' -> ' + JSON.stringify(error), 'OK');        
        }
      } finally {
        this.systemService.insightStatus.update(EStatus.not_running);
      }
    }
  }

  safeHTML(unsafe: string) {
    return this.sanitizer.bypassSecurityTrustHtml(unsafe);
  }

  reformat = (answer: string, input_tokens: number, output_tokens: number, duration: number): string => {
    // Look for 'answer:' and add 2 line seps
    const fIdx: number = answer.toLowerCase().indexOf('</think>');
    if (fIdx > -1) {
      console.log('splicing think');
      answer = answer.substring(0, fIdx + 8) + '<br><br>' + answer.substring(fIdx + 8);
    }
    const fIdx1: number = answer.toLowerCase().indexOf('answer:');
    if (fIdx1 > -1) {
      console.log('splicing answer');
      answer = answer.substring(0, fIdx1) + '<br><br>' + answer.substring(fIdx1);
    }
    return answer + '<br><br> <small><I>tokens:' + input_tokens + ' in / ' + output_tokens + ' out<I> (' + (duration / 1000).toFixed(0) +'s)</small>';
  }

  scrollToBottom = () => {
    const chatDiv = document.getElementById('chatDiv');
    if (chatDiv) {
      chatDiv.scrollTop = chatDiv.scrollHeight;
    }
  }

  copyContent = async (ev: any, text: string) => {
    this.clipboard.copy(text);
    this._snackBar.open(await this.commonService.get('PAGES.INSIGHT.COPY_CONTENT'), 'OK', {
      duration: 2500
    });
  }

  rate = async (ev: any, id: string, rating: number) => {
    console.log('rate:', id);
    const fIdx: number = this.systemService.history.findIndex(f => f.id === id);
    if (fIdx > -1) {
      this.systemService.history[fIdx].assessment = rating;
      this.systemService.saveMainHistory();
      this._snackBar.open(await this.commonService.get('PAGES.INSIGHT.RATING_THANKS'), 'OK', {
        duration: 2500
      });
    }
  }

  reset = async (event: any) => {
    const dialogRef = this.dialog.open(
      AlertComponent, {
        data: {
          type: 1,
          params: {
            message: await this.commonService.get('PAGES.INSIGHT.RESET_ARE_YOU_SURE')
          }
        }
    });
    dialogRef.afterClosed().subscribe(async (result: boolean) => {
      console.log(`Dialog result: ${result}`);
      if (result === true) {
        // Remove ollama and restart          
      }
    });
  }

  changeCollection = async (ev: any) => {
    this.systemService.collection = this.systemService.selectedCollections.value ? this.commonService.basename(this.systemService.selectedCollections.value) : 'general';
    console.log('change to collection:', this.systemService.collection)
    this.clearHistory();
    await this.systemService.saveChunkSettings();
    this.mediaService.loadedIndex = false;    
    await this.systemService.refreshFileList(this.mediaService, true);
  }

  addDocuments = async (ev: any) => {
    this.isDocsOpen = true;
    const dialogRef = this.dialog.open(
      IngestComponent, {        
//        ariaModal: true,
        maxWidth: '95vw',
        maxHeight: '95vh',
        width: '100%',
        height: '80%',        
        position: { top: '100px' },
        panelClass: 'full-screen-modal',
        hasBackdrop: false,
        data: {}
    });
    dialogRef.afterClosed().subscribe(async (result: boolean) => {
      this.isDocsOpen = false;
      this.ollamaService.useDocContext = this.systemService.hasEmbedded();
      console.log(`Ingest result: ${result}`);
      if (!result) {
        this.ollamaService.useDocContext = false;
      }      
    });    
  }

  manageModel = async (ev: any) => {
    this.isModelOpen = true;
    const dialogRef = this.dialog.open(
      DetailComponent, {        
        maxWidth: '95vw',
        maxHeight: '95vh',
        width: '100%',
        height: '80%',        
        position: { top: '100px' },
        panelClass: 'full-screen-modal',
        hasBackdrop: false,
        data: {}
    });
    dialogRef.afterClosed().subscribe(async (result: boolean) => {
      this.isModelOpen = false;      
    });    
  }

  openSettings = async (ev: any) => {
    this.isSettingsOpen = true;
    const dialogRef = this.dialog.open(
      InsightOptionsComponent, {        
        maxWidth: '95vw',
        maxHeight: '95vh',
        width: '100%',
        height: '80%',        
        position: { top: '100px' },
        panelClass: 'full-screen-modal',
        hasBackdrop: false,
        data: {}
    });
    dialogRef.afterClosed().subscribe(async (result: boolean) => {
      this.isSettingsOpen = false;      
    });    
  }

  getRemoveMsg = (msg: string): string => {
    return msg + ' ' + this.systemService.ragFiles.map(e => this.commonService.basename(e.name)).join(', ');
  }
}

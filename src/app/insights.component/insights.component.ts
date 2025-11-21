import { Component, NgZone, OnInit, effect, inject } from '@angular/core';
import { MatButton, MatButtonModule } from '@angular/material/button';
import { TranslateModule } from '@ngx-translate/core';
import { SystemService } from '../core/services/system/system.service';
import { EStatus, EWho, IGenInfo } from '../shared/model';
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
import { MatTooltipModule } from '@angular/material/tooltip';
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
    MatSlideToggleModule
  ],
  templateUrl: './insights.component.html',
  styleUrl: './insights.component.scss'
})
export class InsightsComponent implements OnInit { 
  private _snackBar = inject(MatSnackBar);
  readonly dialog = inject(MatDialog);
  modelUsage: string = '';
  streaming: boolean = false;
  streamedResponse: string = '';
  generationInfo: IGenInfo | undefined;
  overallStatus: EStatus | undefined;
  insightStatus: EStatus | undefined;
  isOpen = false;
  breakpoint: number = 4;

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
            this.generationInfo = data.generations[0][0].generationInfo as IGenInfo;
            console.log('generationInfo:', this.generationInfo);            
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

  onResize = (event: any) => {
    this.breakpoint = Math.floor(event.target.innerWidth / 300);
  }
  
  async ngOnInit() {
    this.check();
    // this.askQuestion('How are you today?');

    await this.mediaService.createCollection(this.systemService.collection);
    this.systemService.collections = await this.mediaService.getCollections();
    const selectedCollection: any = this.systemService.collections.find(f => f.name === this.systemService.collection).value
    console.log('selected:', selectedCollection);
    this.systemService.selectedCollections.setValue(selectedCollection);
    this.systemService.ragFiles = await this.mediaService.ls();
  }

  check = () => {
    this.mediaService.ls().then((files: any[]) => {
      this.systemService.docsEmpty = (files.length === 0)
    })
  }

  clearHistory = () => {
    this.systemService.chatHistory = [];
  }

  //TODO: When we submit a query perform a ps to get the model usage
  askQuestion = async () => {
    if (this.systemService.question) {
      this.systemService.saveChunkSettings();
      this.systemService.saveInsightSettings();

      const isCSVUseCase: boolean = await this.mediaService.areAllCSV();
      const question: string = this.systemService.question;
      this.systemService.question = '';            

      const options: any = {
        baseUrl: this.ollamaService.isCloud() ? "https://ollama.com": "http://localhost:11434",
        useDocContext: this.ollamaService.useDocContext,
        question,
        model: this.ollamaService.selectedModel,
        prompt: await this.commonService.get('PAGES.INSIGHT.PROMPT'),
        historyPrompt: await this.commonService.get('PAGES.INSIGHT.HISTORY_PROMPT'),
        contextPrompt: await this.commonService.get('PAGES.INSIGHT.CONTEXTUAL_PROMPT'),
        chatHistory: this.systemService.chatHistory.map(f => f.who === EWho.Assistant ? 'Assistant: ' + f.content : 'User: ' + f.content).join('\n'),
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
        numCtx: isCSVUseCase ? 10240 : this.systemService.numCtx
      };
      if (this.systemService.filter) {
        options.filter = this.systemService.filter;
      }

      this.systemService.chatHistory.push({
        who: EWho.User,
        content: question,
        docSources: [],
      });
      this.scrollToBottom();
      this.systemService.insightStatus.update(EStatus.thinking);
      this.streaming = true;
      this.streamedResponse = '';
      const answerResponse: any = await this.systemService.commandInsight('question', options);
      const { answer, error, docSources } = answerResponse;
      this.streamedResponse = '';
      this.streaming = false;
      this.systemService.insightStatus.update(EStatus.running);
      console.log('answerResponse:', answerResponse);
      try {
        if (!error) {
          console.log('PUSHING ANSWER:', answer);
          this.systemService.chatHistory.push({
            who: EWho.Assistant,
            content: this.generationInfo ? this.reformat(answer, this.generationInfo.prompt_eval_count, this.generationInfo.eval_count) : this.reformat(answer, 0, 0),
            docSources
          });
          this.systemService.history.unshift({
            when: new Date(),
            q_expanded: false,
            a_expanded: false,
            question,
            answer,
            docContext: this.ollamaService.useDocContext,
            ingest: {
              embeddings_model: this.ollamaService.embeddings_model,
              chunkSize: this.systemService.chunkSize,
              overlap: this.systemService.overlap,
              separator: this.systemService.separator,
              useSemantic: this.systemService.useSemantic,
              localVector: this.systemService.localVector,
              collection: this.systemService.collection
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
          this.systemService.saveMainHistory();
          this.scrollToBottom();

          // Get the model usage  
          const usageTimer = setInterval(async () => {
            const usage = await this.ollamaService.getRunningModelsUsage();
            if (usage) {
              clearInterval(usageTimer);
              this.modelUsage = usage + ' ';
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

  reformat = (answer: string, input_tokens: number, output_tokens: number): string => {
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
    return answer + '<br><br> <small><I>tokens:' + input_tokens + ' in / ' + output_tokens + " out<I></small>";
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

  rate = async (ev: any, index: number, rating: number) => {
    console.log('rate:', index);
    this.systemService.history[index-1].assessment = rating;
    this.systemService.saveMainHistory();
    this._snackBar.open(await this.commonService.get('PAGES.INSIGHT.RATING_THANKS'), 'OK', {
      duration: 2500
    });
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
    this.systemService.ragFiles = await this.mediaService.ls(true);    
  }

  addDocuments = async (ev: any) => {
    this.isOpen = true;
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
      this.isOpen = false;
      this.ollamaService.useDocContext = this.systemService.hasEmbedded();
      console.log(`Ingest result: ${result}`);
      if (!result) {
        this.ollamaService.useDocContext = false;
      }
    });    
  }
}

import { Component, NgZone, OnInit, effect, inject } from '@angular/core';
import { MatButton, MatButtonModule } from '@angular/material/button';
import { TranslateModule } from '@ngx-translate/core';
import { EWho, SystemService } from '../core/services/system/system.service';
import {MatInputModule} from '@angular/material/input';
import {MatChipsModule} from '@angular/material/chips';
import {MatProgressSpinnerModule} from '@angular/material/progress-spinner';
import { MatToolbar, MatToolbarModule } from "@angular/material/toolbar";
import { MatIconModule } from '@angular/material/icon';
import {MatProgressBarModule} from '@angular/material/progress-bar';
import {MatGridListModule} from '@angular/material/grid-list';
import {MatListModule} from '@angular/material/list';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
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
  ],
  templateUrl: './insights.component.html',
  styleUrl: './insights.component.scss'
})
export class InsightsComponent implements OnInit { 
  private _snackBar = inject(MatSnackBar);
  readonly dialog = inject(MatDialog);
  url: string = 'http://localhost:8501';
  urlSafe: SafeResourceUrl;
  modelUsage: string = '';
  question: string = '';
  streaming: boolean = false;
  streamedResponse: string = '';
  
  constructor(
    private bridgeService: BridgeService,
    public systemService: SystemService,
    private sanitizer: DomSanitizer,
    private mediaService: MediaService,
    private ngZone: NgZone
  ) {

    this.bridgeService.chatCallback((ev: any, response: any) => {
      // console.log('chat-event', response);
      this.ngZone.run(() => {
        if (response.chunk) {
          this.streamedResponse += response.chunk;
          this.scrollToBottom();
        }
      });
    });

    this.urlSafe = this.sanitizer.bypassSecurityTrustResourceUrl(this.url);
    effect(() => {      
      this.systemService.insightStatus();
      if (this.systemService.overallStatus() !== 'running: healthy') {
        this.check();
      }
    })
  }  

  ngOnInit(): void {
    this.check();
    // this.askQuestion('How are you today?');
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
    if (this.question) {
      this.systemService.saveChunkSettings();
      this.systemService.saveInsightSettings();

      const isCSVUseCase: boolean = await this.mediaService.areAllCSV();
      const question: string = this.question;
      this.question = '';            

      const options: any = {
        question,
        model: this.systemService.selectedModel,
        prompt: await this.systemService.get('PAGES.INSIGHT.PROMPT'),
        historyPrompt: await this.systemService.get('PAGES.INSIGHT.HISTORY_PROMPT'),
        contextPrompt: await this.systemService.get('PAGES.INSIGHT.CONTEXTUAL_PROMPT'),
        chatHistory: this.systemService.chatHistory.map(f => f.who === EWho.Assistant ? 'Assistant: ' + f.content : 'User: ' + f.content).join('\n'),
        max_tokens: 256,
        temperature: 0.7,
        top_p: 0.9,
        frequency_penalty: 0,
        presence_penalty: 0,
        stop: ["\n"],
        stream: true,
        think: this.systemService.getThinkingForModel(this.systemService.selectedModel),
        k: isCSVUseCase ? 2048  : this.systemService.k,
        mmr: this.systemService.k < 30 && !isCSVUseCase ? true : undefined,
        numCtx: isCSVUseCase ? 10240 : this.systemService.numCtx
      };
      if (this.systemService.filter) {
        options.filter = this.systemService.filter;
      }

      this.systemService.chatHistory.push({
        who: EWho.User,
        content: question
      });
      this.scrollToBottom();
      this.systemService.insightStatus.update(() => 'thinking');
      this.streaming = true;
      this.streamedResponse = '';
      const answer: string = await this.systemService.commandInsight('question', options);
      this.streamedResponse = '';
      this.streaming = false;
      this.systemService.insightStatus.update(() => 'running');
      console.log('Answer:', answer);
      try {
        if (typeof answer === 'string') {
          console.log('PUSHING ANSWER:', answer);
          this.systemService.chatHistory.push({
            who: EWho.Assistant,
            content: this.reformat(answer)
          });
          this.scrollToBottom();

          // Get the model usage  
          const usageTimer = setInterval(async () => {
            const usage = await this.systemService.getRunningModelsUsage();
            if (usage) {
              clearInterval(usageTimer);
              this.modelUsage = usage + ' ';
            }
          }, 2000);    
        } else {
          this._snackBar.open(await this.systemService.get('PAGES.INSIGHT.LLM_ERROR'), 'OK');        
        }
      } finally {
        this.systemService.insightStatus.update(() => 'not running');
      }
    }
  }

  safeHTML(unsafe: string) {
    return this.sanitizer.bypassSecurityTrustHtml(unsafe);
  }

  reformat = (answer: string): string => {
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
    return answer;
  }

  scrollToBottom = () => {
    const chatDiv = document.getElementById('chatDiv');
    if (chatDiv) {
      chatDiv.scrollTop = chatDiv.scrollHeight;
    }
  }

  reset = async (event: any) => {
    const dialogRef = this.dialog.open(
      AlertComponent, {
        data: {
          type: 1,
          params: {
            message: await this.systemService.get('PAGES.INSIGHT.RESET_ARE_YOU_SURE')
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
    this.systemService.collection = this.systemService.selectedCollections.value ? this.systemService.basename(this.systemService.selectedCollections.value) : 'general';
    console.log('change to collection:', this.systemService.collection)
    await this.systemService.saveChunkSettings();
    this.mediaService.loadedIndex = false;
    this.systemService.ragFiles = await this.mediaService.ls(true);    
  }
}

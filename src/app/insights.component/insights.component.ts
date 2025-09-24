import { Component, OnInit, effect, inject } from '@angular/core';
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
import { FormsModule } from '@angular/forms';

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
    FormsModule
  ],
  templateUrl: './insights.component.html',
  styleUrl: './insights.component.scss'
})
export class InsightsComponent implements OnInit {  
  readonly dialog = inject(MatDialog);
  url: string = 'http://localhost:8501';
  urlSafe: SafeResourceUrl;
  modelUsage: string = '';
  question: string = '';
  
  constructor(
    public systemService: SystemService,
    private sanitizer: DomSanitizer,
    private mediaService: MediaService
  ) {
    this.urlSafe = this.sanitizer.bypassSecurityTrustResourceUrl(this.url);
    effect(() => {      
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
      const question: string = this.question;
      
      this.systemService.chatHistory.unshift({
        who: EWho.User,
        content: question
      });
      const contextPrompt = `Given a chat history and the latest user question which might reference context in the chat history, formulate a standalone question which can be understood without the chat history. Do NOT answer the question, just reformulate it if needed and otherwise return it as is.

      Chat History:
      ${this.systemService.chatHistory.map(f => f.who === EWho.Assistant ? 'Assistant: ' + f.content : 'User: ' + f.content).join('\n')}

      Latest Question:
      ${question}

      Reformulated Question:`;

      const options = {
        model: this.systemService.selectedModel,
        prompt: contextPrompt,
        max_tokens: 256,
        temperature: 0.7,
        top_p: 0.9,
        frequency_penalty: 0,
        presence_penalty: 0,
        stop: ["\n"],
        stream: true,
        think: this.systemService.getThinkingForModel(this.systemService.selectedModel),
      };

      this.systemService.insightStatus.update(() => 'thinking');
      const answer: string = await this.systemService.commandInsight('question', options);
      this.systemService.insightStatus.update(() => 'running');
      console.log('Answer:', answer);
      this.systemService.chatHistory.unshift({
        who: EWho.Assistant,
        content: answer
      });
      // Get the model usage  
      const usageTimer = setInterval(async () => {
        const usage = await this.systemService.getRunningModelsUsage();
        if (usage) {
          clearInterval(usageTimer);
          this.modelUsage = usage + ' ';
        }
      }, 2000);    
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
}

import { Component, OnInit, inject, effect, ViewChild } from '@angular/core';
import { TranslateModule } from '@ngx-translate/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatSliderModule } from '@angular/material/slider';
import { JsonViewModule, JsonViewComponent } from 'nxt-json-view'
import { MatIcon } from '@angular/material/icon';
import { SystemService } from '../core/services/system/system.service';
import { TranslateService } from '@ngx-translate/core';
import { MatToolbarModule } from '@angular/material/toolbar';
import {MatProgressSpinnerModule} from '@angular/material/progress-spinner';
import {MatExpansionModule} from '@angular/material/expansion';
import {MatChipsModule} from '@angular/material/chips';
import {MatTooltipModule} from '@angular/material/tooltip';
import {MatSlideToggleModule} from '@angular/material/slide-toggle';
import { MatDialog } from '@angular/material/dialog';
import { AlertComponent } from '../alert.component/alert.component';
import {Clipboard} from '@angular/cdk/clipboard';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MediaService } from '../core/services';
import { SplashComponent } from '../splash.component/splash.component';

@Component({
    selector: 'app-home',
    templateUrl: './home.component.html',
    styleUrls: ['./home.component.scss'],
    standalone: true,
    imports: [
      TranslateModule,
      MatCardModule,
      MatButtonModule,
      MatIcon,
      JsonViewModule,
      MatSliderModule,
      MatToolbarModule,
      MatProgressSpinnerModule,
      MatExpansionModule,
      MatChipsModule,
      MatTooltipModule,
      MatSlideToggleModule,
      SplashComponent
    ]
})
export class HomeComponent implements OnInit {
  private _snackBar = inject(MatSnackBar);
  readonly dialog = inject(MatDialog);
  @ViewChild('cpu', {static: true}) cpu!: JsonViewComponent;
  @ViewChild('gpu', {static: true}) gpu!: JsonViewComponent;
  @ViewChild('mem', {static: true}) mem!: JsonViewComponent;
  @ViewChild('disks', {static: true}) disks!: JsonViewComponent;
  private translate = inject(TranslateService);

  constructor(
    public systemService: SystemService,
    private clipboard: Clipboard,
    private mediaService: MediaService
  ) {    
    effect(() => {
      /*
      if (this.cpu) {
        this.cpu.expandTo(0);
      }
      if (this.gpu) {
        this.gpu.expandTo(0);
      }
      if (this.mem) {
        this.mem.expandTo(0);
      }
      if (this.disks) {
        this.disks.expandTo(2);
      }
      */
    })
  }

  async ngOnInit() {}

  manageExternally = async (event: any) => {
    const dialogRef = this.dialog.open(
      AlertComponent, {
        data: {
          type: 1,
          params: {
            message: await this.systemService.get('PAGES.HOME.EXTERNAL_ARE_YOU_SURE')
          }
        }
      });
    dialogRef.afterClosed().subscribe(async (result) => {
      console.log(`Dialog result: ${result}`);
      if (result === true) {            
        this.systemService.manageOllamaExternally = event.checked;
        localStorage.setItem('manage-ollama-externally', JSON.stringify(this.systemService.manageOllamaExternally));
        // Force exit
        this.systemService.ollamaStatus.update(() => 'configuring');
        await this.systemService.quitApp();
      } else {
        event.source.checked = !event.checked;
      }
    })
  }

  formatLabel = (value: number): string => {
    if (value >= 1000) {
      return Math.round(value / 1000) + 'k';
    }

    return `${value}`;
  }

  copyContent = async (ev: any, text: string) => {
    this.clipboard.copy(text);
    this._snackBar.open(await this.systemService.get('PAGES.INSIGHT.COPY_CONTENT'), 'OK', {
      duration: 2500
    });
  }

  formatGenInfo = (info: any): string => {
    return JSON.stringify(info);
  }

  reformat = (text: string | undefined): string | undefined => {
    if (text) {
      return text.length > 60 ? text.substring(0, 60) + '...' : text;
    }
  }

  toggleFullText = (ev: any, QorA: string, index: number) => {
    const htmlTextElement: HTMLElement | null = document.getElementById("historyPart" + QorA + index);
    if (htmlTextElement) {
      if (QorA === 'Q') {
        const expand: boolean = this.systemService.history[index].q_expanded;
        if (expand) {
          htmlTextElement.innerHTML = this.systemService.history[index].question.substring(0, 60) + '...';
        } else {
          htmlTextElement.innerHTML = this.systemService.history[index].question;
        }
        this.systemService.history[index].q_expanded = !expand;
      } else {
        const expand: boolean = this.systemService.history[index].a_expanded;
        if (expand) {
          htmlTextElement.innerHTML = this.systemService.history[index].answer.substring(0, 60) + '...';
        } else {
          htmlTextElement.innerHTML = this.systemService.history[index].answer;
        }
        this.systemService.history[index].a_expanded = !expand;
      }
    }
  }

  clearAll = (ev: any) => {
    this.systemService.history = [];
    this.systemService.saveMainHistory();
  }

  clear = (ev: any, index: number) => {
    this.systemService.history.splice(index, 1);
    this.systemService.saveMainHistory();
  }

  restore = async (ev: any, index: number) => {
    console.log('restoring:', this.systemService.history[index].ingest, this.systemService.history[index].insight);
    this.systemService.chunkSize = this.systemService.history[index].ingest.chunkSize;
    if (this.systemService.collections.length === 0) {
      this.systemService.collections = await this.mediaService.getCollections();
    }
    if (this.systemService.collections.findIndex(f => this.systemService.basename(f.value) === this.systemService.history[index].ingest.collection) > -1) {
      this.systemService.collection = this.systemService.history[index].ingest.collection;
    }
    if (this.systemService.availableModels.findIndex(f => f.name === this.systemService.history[index].ingest.embeddings_model) > -1) {
      this.systemService.embeddings_model = this.systemService.history[index].ingest.embeddings_model;
    }
    this.systemService.localVector = this.systemService.history[index].ingest.localVector;
    this.systemService.overlap = this.systemService.history[index].ingest.overlap;
    this.systemService.useSemantic = this.systemService.history[index].ingest.useSemantic;
    this.systemService.separator = this.systemService.history[index].ingest.separator;

    if (this.systemService.availableModels.findIndex(f => f.name === this.systemService.history[index].insight.model) > -1) {
      this.systemService.selectedModel = this.systemService.history[index].insight.model;
    }
    this.systemService.userPrompt = this.systemService.history[index].insight.userPrompt;
    this.systemService.ragPrompt = this.systemService.history[index].insight.ragPrompt;
    this.systemService.k = this.systemService.history[index].insight.k;
    this.systemService.numCtx = this.systemService.history[index].insight.numCtx;
    this.systemService.question = this.systemService.history[index].question;

    this._snackBar.open(await this.systemService.get('PAGES.HOME.RESTORE_SETTINGS'), 'OK', {
      duration: 2500
    });
  }
}

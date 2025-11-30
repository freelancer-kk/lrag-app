import { Component, OnInit, inject, effect, ViewChild, OnDestroy } from '@angular/core';
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
import {MatExpansionModule, MatExpansionPanel} from '@angular/material/expansion';
import {MatChipsModule} from '@angular/material/chips';
import {MatTooltipModule} from '@angular/material/tooltip';
import {MatSlideToggleModule} from '@angular/material/slide-toggle';
import { MatDialog } from '@angular/material/dialog';
import { AlertComponent } from '../alert.component/alert.component';
import {Clipboard} from '@angular/cdk/clipboard';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MediaService } from '../core/services';
import { SplashComponent } from '../splash.component/splash.component';
import { OllamaService } from '../core/services/ollama-service';
import { EStatus } from '../shared/model';
import { CommonService } from '../core/services/common-service';
import { RerankerService } from '../core/services/reranker-service';
import { WatcherService } from '../core/services/watcher-service';

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
export class HomeComponent implements OnInit, OnDestroy {
  private _snackBar = inject(MatSnackBar);
  readonly dialog = inject(MatDialog);
  @ViewChild('cpu', {static: true}) cpu!: JsonViewComponent;
  @ViewChild('gpu', {static: true}) gpu!: JsonViewComponent;
  @ViewChild('mem', {static: true}) mem!: JsonViewComponent;
  @ViewChild('disks', {static: true}) disks!: JsonViewComponent;
  @ViewChild('splash', {static: true}) splash!: MatExpansionPanel;
  private translate = inject(TranslateService);

  EStatus: typeof EStatus = EStatus;

  modelStatus: EStatus | undefined;
  ingestStatus: EStatus | undefined;
  insightStatus: EStatus | undefined;
  overallStatus: EStatus | undefined;

  constructor(
    public commonService: CommonService,
    public systemService: SystemService,
    public ollamaService: OllamaService,
    public rerankerService: RerankerService,
    public watcherService: WatcherService,
    private clipboard: Clipboard,
    private mediaService: MediaService
  ) {    
    effect(() => {
      this.modelStatus = this.systemService.modelStatus.get();
      this.ingestStatus = this.systemService.ingestStatus.get();
      this.insightStatus = this.systemService.insightStatus.get();
      this.overallStatus = this.systemService.mainStatus.get();
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
     if (this.systemService.startShow() === false) {
      this.splash.expanded = false;
     }
    })
  }

  async ngOnInit() {
    setTimeout(async () => {
      if (this.systemService.appVersionChange || this.systemService.servicesDownloading) {
        this.splash.expanded = true;
        await this.startShow(undefined);
      }
    }, 5000)
  }

  ngOnDestroy(): void {
    this.endShow(undefined);
  }

  manageExternally = async (event: any) => {
    const dialogRef = this.dialog.open(
      AlertComponent, {
        data: {
          type: 1,
          params: {
            message: await this.commonService.get('PAGES.HOME.EXTERNAL_ARE_YOU_SURE')
          }
        }
      });
    dialogRef.afterClosed().subscribe(async (result) => {
      console.log(`Dialog result: ${result}`);
      if (result === true) {            
        this.ollamaService.manageOllamaExternally = event.checked;
        await this.commonService.setEnvValue('MANAGE_EXTERNAL', this.ollamaService.manageOllamaExternally ? "true" : "false");
        // localStorage.setItem('manage-ollama-externally', JSON.stringify(this.ollamaService.manageOllamaExternally));        
        // Force exit
        this.ollamaService.status.update(EStatus.configuring);
        await this.commonService.quitApp();
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
    this._snackBar.open(await this.commonService.get('PAGES.INSIGHT.COPY_CONTENT'), 'OK', {
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
    this.ollamaService.useDocContext = this.systemService.history[index].docContext;
    if (this.systemService.collections.length === 0) {
      this.systemService.collections = await this.mediaService.getCollections();
    }
    if (this.systemService.collections.findIndex(f => this.commonService.basename(f.value) === this.systemService.history[index].ingest.collection) > -1) {
      this.systemService.collection = this.systemService.history[index].ingest.collection;
      this.mediaService.loadedIndex = false;
      this.systemService.ragFiles = []; await this.mediaService.ls((names: any[]) => { this.systemService.ragFiles.push(names); }, true);
    }
    if (this.ollamaService.availableModels.findIndex(f => f.name === this.systemService.history[index].ingest.embeddings_model) > -1) {
      this.ollamaService.embeddings_model = this.systemService.history[index].ingest.embeddings_model;
    }
    if (this.ollamaService.availableModels.findIndex(f => f.name === this.systemService.history[index].ingest.ocr_model) > -1) {
      this.ollamaService.ocr_model = this.systemService.history[index].ingest.ocr_model;
    }
    this.systemService.localVector = this.systemService.history[index].ingest.localVector;
    this.systemService.overlap = this.systemService.history[index].ingest.overlap;
    this.systemService.useSemantic = this.systemService.history[index].ingest.useSemantic;
    this.systemService.separator = this.systemService.history[index].ingest.separator;

    if (this.ollamaService.availableModels.findIndex(f => f.name === this.systemService.history[index].insight.model) > -1) {
      this.ollamaService.selectedModel = this.systemService.history[index].insight.model;
    }
    this.systemService.userPrompt = this.systemService.history[index].insight.userPrompt;
    this.systemService.ragPrompt = this.systemService.history[index].insight.ragPrompt;
    this.systemService.k = this.systemService.history[index].insight.k;
    this.systemService.numCtx = this.systemService.history[index].insight.numCtx;
    this.systemService.question = this.systemService.history[index].question;

    this.ollamaService.resetChatHistory();
    this._snackBar.open(await this.commonService.get('PAGES.HOME.RESTORE_SETTINGS'), 'OK', {
      duration: 2500
    });
  }

  startShow = async (ev: any) => {
    console.log('afterExpand: startShow');
    this.systemService.startShow.update(() => true);        
  }

  endShow = (ev: any) => {
    this.systemService.startShow.update(() => false);
  }
}

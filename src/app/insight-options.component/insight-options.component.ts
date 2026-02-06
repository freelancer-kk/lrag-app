import { Component, effect, inject, Injector, ViewChild, afterNextRender } from '@angular/core';
import { SystemService } from '../core/services';
import { EStatus } from '../shared/model';
import { TranslateModule } from '@ngx-translate/core';
import { MatButtonModule } from '@angular/material/button';
import { MatInputModule } from '@angular/material/input';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { MatSliderModule } from '@angular/material/slider';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatDialogModule } from '@angular/material/dialog';
import { SettingsService } from '../core/services/settings-service';
import { OllamaService } from '../core/services/ollama-service';
import {CdkTextareaAutosize, TextFieldModule} from '@angular/cdk/text-field';
import {  MatIconModule } from '@angular/material/icon';
import { CommonService } from '../core/services/common-service';

@Component({
  selector: 'app-insight-options.component',
  imports: [TranslateModule,
    MatButtonModule,
    MatInputModule,
    MatToolbarModule,
    MatTooltipModule,
    MatIconModule,
    MatSliderModule,
    MatExpansionModule,
    FormsModule,
    ReactiveFormsModule,
    MatSlideToggleModule,
    MatDialogModule,
    TextFieldModule
  ],
  templateUrl: './insight-options.component.html',
  styleUrl: './insight-options.component.scss'
})
export class InsightOptionsComponent {
  private _injector = inject(Injector);
  
  @ViewChild('autosize') autosize: CdkTextareaAutosize | undefined;
  @ViewChild('autosize1') autosize1: CdkTextareaAutosize | undefined;
  @ViewChild('autosize2') autosize2: CdkTextareaAutosize | undefined;

  overallStatus: EStatus | undefined;
  insightStatus: EStatus | undefined;

  EStatus: typeof EStatus = EStatus;

  constructor(
    public ollamaService: OllamaService,
    private commonService: CommonService,
    public systemService: SystemService,
    public settingsService: SettingsService
  ) {

    effect(() => {      
      this.insightStatus = this.systemService.insightStatus.get();
      this.overallStatus = this.systemService.mainStatus.get();      
    })    
  }

  triggerResize = () => {
    // Wait for content to render, then trigger textarea resize.
    afterNextRender(
      () => {
        this.autosize?.resizeToFitContent(true);
        this.autosize1?.resizeToFitContent(true);
        this.autosize2?.resizeToFitContent(true);
      },
      {
        injector: this._injector,
      },
    );
  }

  resetRag = async (ev: any) => {
    this.systemService.ragPrompt = await this.commonService.get('PAGES.INSIGHT.CONTEXTUAL_PROMPT')
  }

  resetUser = async (ev: any) => {
    this.systemService.userPrompt = await this.commonService.get('PAGES.INSIGHT.PROMPT')
  }
}

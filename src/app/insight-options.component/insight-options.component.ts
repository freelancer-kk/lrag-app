import { Component, effect } from '@angular/core';
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

@Component({
  selector: 'app-insight-options.component',
  imports: [TranslateModule,
    MatButtonModule,
    MatInputModule,
    MatToolbarModule,
    MatTooltipModule,
    FormsModule,
    MatSliderModule,
    MatExpansionModule,
    FormsModule,
    ReactiveFormsModule,
    MatSlideToggleModule,
    MatDialogModule
  ],
  templateUrl: './insight-options.component.html',
  styleUrl: './insight-options.component.scss'
})
export class InsightOptionsComponent {
  overallStatus: EStatus | undefined;
  insightStatus: EStatus | undefined;

  EStatus: typeof EStatus = EStatus;

  constructor(
    public ollamaService: OllamaService,
    public systemService: SystemService,
    public settingsService: SettingsService,   
  ) {

    effect(() => {      
      this.insightStatus = this.systemService.insightStatus.get();
      this.overallStatus = this.systemService.mainStatus.get();      
    })
  }

}

import { Component } from '@angular/core';
import { SettingsService } from '../core/services/settings-service';
import { TranslateModule } from '@ngx-translate/core';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatTooltipModule } from '@angular/material/tooltip';
import { JsonViewModule } from 'nxt-json-view';

@Component({
  selector: 'app-settings.component',
  imports: [
    TranslateModule,
    MatCardModule,
    MatButtonModule,
    MatIcon,
    MatToolbarModule,
    MatProgressSpinnerModule,
    MatExpansionModule,
    MatTooltipModule,
    JsonViewModule,
  ],
  templateUrl: './settings.component.html',
  styleUrl: './settings.component.scss'
})
export class SettingsComponent {
  constructor(
    public settingsService: SettingsService
  ) {}
}

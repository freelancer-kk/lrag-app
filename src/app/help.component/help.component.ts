import { Component } from '@angular/core';
import { TranslateModule } from '@ngx-translate/core';
import { CommonService } from '../core/services/common-service';
import { SystemService } from '../core/services';
import { MatButton } from '@angular/material/button';
import { SettingsService } from '../core/services/settings-service';

@Component({
  selector: 'app-help.component',
  imports: [
    TranslateModule,
    MatButton
  ],
  templateUrl: './help.component.html',
  styleUrl: './help.component.scss'
})
export class HelpComponent {
  constructor(
    public commonService: CommonService,
    public settingsService: SettingsService,
    public systemService: SystemService
  ) {}
}

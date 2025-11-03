import { Component } from '@angular/core';
import { TranslateModule } from '@ngx-translate/core';
import { CommonService } from '../core/services/common-service';
import { SystemService } from '../core/services';
import { MatButton } from '@angular/material/button';

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
    public systemService: SystemService
  ) {}
}

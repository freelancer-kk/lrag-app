import { Component } from '@angular/core';
import { TranslateModule } from '@ngx-translate/core';
import { CommonService } from '../core/services/common-service';
import { SystemService } from '../core/services';
import { MatButton } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-legal',
  standalone: true,
  imports: [
    TranslateModule,
    MatButton,
    FormsModule,
    MatCheckboxModule
  ],
  templateUrl: './legal.component.html',
  styleUrl: './legal.component.scss'
})
export class LegalComponent {
  constructor(
    public commonService: CommonService,
    public systemService: SystemService
  ) {}
}

import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import {MAT_DIALOG_DATA, MatDialogModule} from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { TranslateModule } from '@ngx-translate/core';

export interface DialogData {
  type: number;  
  params: any;
}

@Component({
  selector: 'app-alert.component',
  templateUrl: './alert.component.html',
  styleUrl: './alert.component.scss',
  imports: [
    MatDialogModule,
    MatButtonModule,
    TranslateModule
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AlertComponent {
  readonly data = inject<DialogData>(MAT_DIALOG_DATA);
}
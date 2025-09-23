import { Component, OnInit, effect, inject } from '@angular/core';
import { MatButton, MatButtonModule } from '@angular/material/button';
import { TranslateModule } from '@ngx-translate/core';
import { SystemService } from '../core/services/system/system.service';
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
  ],
  templateUrl: './insights.component.html',
  styleUrl: './insights.component.scss'
})
export class InsightsComponent implements OnInit {  
  readonly dialog = inject(MatDialog);
  url: string = 'http://localhost:8501';
  urlSafe: SafeResourceUrl;
  modelUsage: string = '';

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
  }

  check = () => {
    this.mediaService.ls().then((files: any[]) => {
      this.systemService.docsEmpty = (files.length === 0)
    })
  }

  //TODO: When we submit a query perform a ps to get the model usage

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

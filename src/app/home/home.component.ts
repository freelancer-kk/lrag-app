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
      MatSlideToggleModule
    ]
})
export class HomeComponent implements OnInit {
  readonly dialog = inject(MatDialog);
  @ViewChild('cpu', {static: true}) cpu!: JsonViewComponent;
  @ViewChild('gpu', {static: true}) gpu!: JsonViewComponent;
  @ViewChild('mem', {static: true}) mem!: JsonViewComponent;
  @ViewChild('disks', {static: true}) disks!: JsonViewComponent;
  private translate = inject(TranslateService);

  constructor(
    public systemService: SystemService,    
  ) {    
    effect(() => {
      this.cpu.expandTo(0);
      this.gpu.expandTo(0);
      this.mem.expandTo(0);
      this.disks.expandTo(2);      
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
}

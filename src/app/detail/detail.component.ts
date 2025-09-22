import { Component, OnInit, inject, effect } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { TranslateModule } from '@ngx-translate/core';
import { SystemService } from '../core/services/system/system.service';
import {FormsModule} from '@angular/forms';
import {MatInputModule} from '@angular/material/input';
import {MatSelectModule} from '@angular/material/select';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatChipsModule} from '@angular/material/chips';
import {MatProgressSpinnerModule} from '@angular/material/progress-spinner';
import { MatToolbar, MatToolbarModule } from "@angular/material/toolbar";
import { MatIconModule } from '@angular/material/icon';
import { MatDialog } from '@angular/material/dialog';
import { AlertComponent } from '../alert.component/alert.component';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatTooltipModule } from '@angular/material/tooltip';

@Component({
    selector: 'app-detail',
    templateUrl: './detail.component.html',
    styleUrls: ['./detail.component.scss'],
    standalone: true,
    imports: [
      TranslateModule,
      MatButtonModule,
      FormsModule,
      MatInputModule,
      MatSelectModule,
      MatFormFieldModule,
      MatToolbar,
      MatIconModule,
      MatChipsModule,
      MatToolbarModule,
      MatProgressSpinnerModule,
      MatSlideToggleModule,
      MatTooltipModule,
  ]
})
export class DetailComponent implements OnInit {
  readonly dialog = inject(MatDialog);
  showModelList: boolean = true;
  
  constructor(
    public systemService: SystemService,
  ) {
    /*
    effect(() => {
      if (this.systemService.isHealthy() && this.systemService.isDockerConnected() === 1) {
        // console.log('PULLING MODELS!!!')
        this.pullModelsIfNecessary();
      }
    })
      */
  }

  async ngOnInit() {}  

  switchGPUAccel = async (event: any) => {    
    const dialogRef = this.dialog.open(
      AlertComponent, {
        data: {
          type: 1,
          params: {
            message: await this.systemService.get('GPU_ARE_YOU_SURE')
          }
        }
      });
    dialogRef.afterClosed().subscribe(async (result) => {
      console.log(`Dialog result: ${result}`);
      if (result === true) {            
        this.systemService.gpuAcceleration = event.checked;
        localStorage.setItem('gpu-accel', JSON.stringify(this.systemService.gpuAcceleration));
        // Remove and restart ollama
        
      } else {
        event.source.checked = !event.checked;
      }
    })
  }

  removeModel = async (event: any, index: number) => {
    const dialogRef = this.dialog.open(
      AlertComponent, {
        data: {
          type: 1,
          params: {
            message: await this.systemService.get('PAGES.DETAIL.DELETE_ARE_YOU_SURE')
          }
        }
      });
    dialogRef.afterClosed().subscribe(async (result) => {
      console.log(`Dialog result: ${result}`);
      if (result === true) {
        this.systemService.commandOllama('rm', { model: this.systemService.availableModels[index].name });
      }
    });
  }
  writeModelToEnv = (): Promise<void> => {
    return this.systemService.setEnvValue('LLM_MODEL_NAME', this.systemService.selectedModel).then((value: any) => {
      return this.systemService.writeEnv().then((res: any) => {        
      })
    }) 
  }

  modelChange = async (event: any) => {
    // Check if model has been already downloaded
    const fIdx: number = this.systemService.availableModels.findIndex(f => f.name === this.systemService.selectedModel);
    if (fIdx === -1) {
      const dialogRef = this.dialog.open(
        AlertComponent, {
          data: {
            type: 0,
            params: {
              model: this.systemService.selectedModel
            }
          }
        });
      dialogRef.afterClosed().subscribe(async (result) => {
        console.log(`Dialog result: ${result}`);
        if (result === true) {
          await this.systemService.commandOllama('pull', { model: this.systemService.selectedModel });
          await this.writeModelToEnv();          
          this.systemService.downloadedLLM = this.systemService.selectedModel;
        } else {
          console.log('reverting:', this.systemService.downloadedLLM);
          this.systemService.selectedModel = this.systemService.downloadedLLM;
        }
      });
    } else {
      await this.writeModelToEnv();      
      this.systemService.downloadedLLM = this.systemService.selectedModel;      
    }    
  }    
}

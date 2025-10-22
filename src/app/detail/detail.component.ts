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
import {MatSnackBar} from '@angular/material/snack-bar';

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
  private _snackBar = inject(MatSnackBar);
  readonly dialog = inject(MatDialog);
  showModelList: boolean = true;
  wt: any;
  libPrefix: string | undefined;
  
  constructor(
    public systemService: SystemService,
  ) {    
    effect(() => {})    
  }

  async ngOnInit() {
    this.libPrefix = await this.systemService.getEnvValue('LIBRARY_PREFIX');
  }  

  showDownloadImageWarning = (message: string = '') => {
    this.wt = setTimeout(async () => {
      this.wt = undefined
      this._snackBar.open(
        message === '' ? await this.systemService.get('APP.DOWNLOAD_IMAGE_WARNING') : message, 
        await this.systemService.get('OK')
      );
    }, 1000)
  }

  clearDownloadImageWarning = () => {
    if (this.wt) {
      clearTimeout(this.wt);
    }    
  }

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
        this.systemService.gpuChangeStatus.update(() => 'running');
        await this.systemService.commandOllama('gpuAccel', {
          gpuAcceleration: this.systemService.gpuAcceleration
        })
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
        this.systemService.availableModels.splice(index, 1);
      }
    });
  }

  writeModelToEnv = (): Promise<void> => {
    return this.systemService.setEnvValue('LLM_MODEL_NAME', this.systemService.selectedModel).then((value: any) => {
      return this.systemService.setEnvValue('EMBEDDINGS_MODEL_NAME', this.systemService.embeddings_model).then((value: any) => {
        return this.systemService.writeEnv().then((res: any) => {})
      })
    }) 
  }
  
  updateModel = async (ev: any, model: string): Promise<void> => {
    await this.systemService.commandOllama(
      'pull', 
      { model, stream: true }
    );
  }

  updateAllModels = async (ev: any): Promise<void> => {
    this.systemService.availableModels.forEach(async (e: any) => {
      await this.updateModel(ev, e.name);
    })
  };

  modelChange = async (event: any, mtype: number) => {
    // Check if model has been already downloaded
    const fIdx: number = this.systemService.availableModels.findIndex(f => f.name === (mtype === 0 ? this.systemService.selectedModel : this.systemService.embeddings_model));
    if (fIdx === -1) {
      const dialogRef = this.dialog.open(
        AlertComponent, {
          data: {
            type: 0,
            params: {
              model: (mtype === 0 ? this.systemService.selectedModel : this.systemService.embeddings_model)
            }
          }
        });
      dialogRef.afterClosed().subscribe(async (result) => {
        console.log(`Dialog result: ${result}`);
        if (result === true) {
          await this.systemService.commandOllama('pull', { model: (mtype === 0 ? this.systemService.selectedModel : this.systemService.embeddings_model), stream: true });
          await this.writeModelToEnv();
          this.systemService.downloadedLLM = (mtype === 0 ? this.systemService.selectedModel : this.systemService.embeddings_model);
        } else {
          console.log('reverting:', this.systemService.downloadedLLM);
          if (mtype === 0) {
            this.systemService.selectedModel = this.systemService.downloadedLLM;
          } else {
            this.systemService.embeddings_model = this.systemService.downloadedLLM;
          }
        }
      });
    } else {
      await this.writeModelToEnv();      
      this.systemService.downloadedLLM = (mtype === 0 ? this.systemService.selectedModel : this.systemService.embeddings_model);      
    }    
  }
  
  openModelDetails = (ev: any, model: string) => {
    this.systemService.openExternal(this.libPrefix + model);
  }
}

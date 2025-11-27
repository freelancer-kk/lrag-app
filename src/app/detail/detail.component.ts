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
import { AlertComponent } from '../alert.component/alert.component';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatTooltipModule } from '@angular/material/tooltip';
import {MatSnackBar} from '@angular/material/snack-bar';
import { MatExpansionModule } from '@angular/material/expansion';
import { CommonService } from '../core/services/common-service';
import { OllamaService } from '../core/services/ollama-service';
import { EStatus } from '../shared/model';
import { SettingsService } from '../core/services/settings-service';
import { MAT_DIALOG_DATA, MatDialog, MatDialogModule } from '@angular/material/dialog';
import { WatcherService } from '../core/services/watcher-service';

export interface ModelDialogData {
  params: any;
}

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
      MatExpansionModule,
      MatDialogModule
  ]
})
export class DetailComponent implements OnInit {
  private _snackBar = inject(MatSnackBar);
  readonly dialog = inject(MatDialog);
  readonly data = inject<ModelDialogData>(MAT_DIALOG_DATA);

  showModelList: boolean = true;
  wt: any;
  libPrefix: string | undefined;
  keyURL: string | undefined;
  overallStatus: EStatus | undefined;

  EStatus: typeof EStatus = EStatus;
  
  constructor(
    public commonService: CommonService,
    public systemService: SystemService,
    public ollamaService: OllamaService,
    public watcherService: WatcherService,
    public settingsService: SettingsService,
  ) {    
    effect(() => {
        this.overallStatus = this.systemService.mainStatus.get();
    })    
  }

  async ngOnInit() {
    this.libPrefix = await this.commonService.getEnvValue('LIBRARY_PREFIX');
    this.keyURL = await this.commonService.getEnvValue('OLLAMA_KEYS_URL');
  }  

  showDownloadImageWarning = (message: string = '') => {
    this.wt = setTimeout(async () => {
      this.wt = undefined
      this._snackBar.open(
        message === '' ? await this.commonService.get('APP.DOWNLOAD_IMAGE_WARNING') : message, 
        await this.commonService.get('OK')
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
            message: await this.commonService.get('GPU_ARE_YOU_SURE')
          }
        }
      });
    dialogRef.afterClosed().subscribe(async (result) => {
      console.log(`Dialog result: ${result}`);
      if (result === true) {            
        this.ollamaService.gpuAcceleration = event.checked;
        await this.ollamaService.setGpuAcceleration();        
      } else {
        event.source.checked = !event.checked;
      }
    })
  }

  switchWatcher = async (event: any) => {    
    const dialogRef = this.dialog.open(
      AlertComponent, {
        data: {
          type: 1,
          params: {
            message: await this.commonService.get('WATCHER_ARE_YOU_SURE')
          }
        }
      });
    dialogRef.afterClosed().subscribe(async (result) => {
      console.log(`Dialog result: ${result}`);
      if (result === true) {            
        this.watcherService.useWatcher = event.checked;
        await this.commonService.setEnvValue('USE_WATCHER', this.watcherService.useWatcher ? 'true' : 'false');
          const dialogRef = this.dialog.open(
            AlertComponent, {
              data: {
                type: 2,
                params: {
                  message: await this.commonService.get('WATCHER_CHANGE_DONE')
                }
              }
            });          
          dialogRef.afterClosed().subscribe(async () => {
            await this.commonService.quitApp();      
          });          
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
            message: await this.commonService.get('PAGES.DETAIL.DELETE_ARE_YOU_SURE')
          }
        }
      });
    dialogRef.afterClosed().subscribe(async (result) => {
      console.log(`Dialog result: ${result}`);
      if (result === true) {
        this.ollamaService.delete(index);        
      }
    });
  }

  writeModelToEnv = (): Promise<void> => {
    return this.commonService.setEnvValue('LLM_MODEL_NAME', this.ollamaService.selectedModel).then((value: any) => {
      return this.commonService.setEnvValue('EMBEDDINGS_MODEL_NAME', this.ollamaService.embeddings_model).then((value: any) => {
        return this.commonService.setEnvValue('OCR_MODEL_NAME', this.ollamaService.ocr_model).then((value: any) => {
          return this.commonService.writeEnv().then((res: any) => {})
        })
      })
    }) 
  }
  
  updateModel = async (ev: any, model: string): Promise<void> => {
    await this.ollamaService.commandOllama(
      'pull', 
      { model, stream: true }
    );
  }

  updateAllModels = async (ev: any): Promise<void> => {
    this.ollamaService.availableModels.forEach(async (e: any) => {
      await this.updateModel(ev, e.name);
    })
  };

  modelChange = async (event: any, mtype: number) => {
    // Check if model has been already downloaded
    const fIdx: number = this.ollamaService.availableModels.findIndex(
      f => f.name === (mtype === 0 ? this.ollamaService.selectedModel : mtype === 1 ? this.ollamaService.embeddings_model : this.ollamaService.ocr_model));
    if (fIdx === -1) {
      let cont: boolean = true;     
       
      if (mtype === 0 && this.ollamaService.models.find(f => f.value === this.ollamaService.selectedModel).cloud) {        
        if (this.ollamaService.apiKey.length < 50) {
          this.ollamaService.cloudSelected = true;
          cont = false;
        }      
      }
      if (cont) {
        const dialogRef = this.dialog.open(
          AlertComponent, {
            data: {
              type: 0,
              params: {
                model: (mtype === 0 ? this.ollamaService.selectedModel : mtype === 1 ? this.ollamaService.embeddings_model : this.ollamaService.ocr_model)
              }
            }
          });
        dialogRef.afterClosed().subscribe(async (result) => {
          console.log(`Dialog result: ${result}`);
          if (result === true) {
            await this.ollamaService.commandOllama('pull', { model: (
              mtype === 0 ? this.ollamaService.selectedModel : mtype === 1 ? this.ollamaService.embeddings_model : this.ollamaService.ocr_model
            ), stream: true });
            await this.writeModelToEnv();
            this.ollamaService.downloadedLLM = (
              mtype === 0 ? this.ollamaService.selectedModel : mtype === 1 ? this.ollamaService.embeddings_model : this.ollamaService.ocr_model
            );
          } else {
            console.log('reverting:', this.ollamaService.downloadedLLM);
            if (mtype === 0) {
              this.ollamaService.selectedModel = this.ollamaService.downloadedLLM;
            } if (mtype === 1) {
              this.ollamaService.embeddings_model = this.ollamaService.downloadedEmbeddedLLM;
            } else {
              this.ollamaService.ocr_model = this.ollamaService.downloadedOCRLLM; 
            }
          }        
        });
      } else {
        if (mtype === 0) {
          setTimeout(() => {
            this.ollamaService.selectedModel = this.ollamaService.downloadedLLM;
          }, 500);
        } if (mtype === 1) {
          this.ollamaService.embeddings_model = this.ollamaService.downloadedEmbeddedLLM;
        } else {
          this.ollamaService.ocr_model = this.ollamaService.downloadedOCRLLM; 
        }
      }
    } else {
      await this.writeModelToEnv();      
      if (mtype === 0) {
        this.ollamaService.downloadedLLM = this.ollamaService.selectedModel;
      } if (mtype === 1) {
        this.ollamaService.downloadedEmbeddedLLM = this.ollamaService.embeddings_model;
      } else {
        this.ollamaService.downloadedOCRLLM = this.ollamaService.ocr_model; 
      }
    }    
  }
  
  openModelDetails = (ev: any, model: string) => {
    this.commonService.openExternal(this.libPrefix + model);
  }

  activate = async (ev: any) => {
    if (this.ollamaService.apiKey) {
      await this.commonService.setEnvValue('OLLAMA_API_KEY', this.ollamaService.apiKey);
      
      const dialogRef = this.dialog.open(
        AlertComponent, {
          data: {
            type: 2,
            params: {
              message: await this.commonService.get('PAGES.DETAIL.EXIT_AFTER_ACTIVATION')
            }
          }
        });
      dialogRef.afterClosed().subscribe(async (result) => {
        console.log(`Dialog result: ${result}`);              
        await this.commonService.quitApp();              
      });        
    }
  }  

  getKey = (ev: any) => {
    this.commonService.openExternal(this.keyURL);
  }
}

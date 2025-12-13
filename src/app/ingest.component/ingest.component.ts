import { Component, OnInit, inject, effect, NgZone } from '@angular/core';
import { MatButtonModule, MatFabButton } from '@angular/material/button';
import { TranslateModule } from '@ngx-translate/core';
import { SystemService } from '../core/services/system/system.service';
import { MatInputModule } from '@angular/material/input';
import { MatChipsModule } from '@angular/material/chips';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatToolbar, MatToolbarModule } from "@angular/material/toolbar";
import { MatIconModule } from '@angular/material/icon';
import { NgxFileDropModule, NgxFileDropEntry, FileSystemFileEntry, FileSystemDirectoryEntry } from 'ngx-file-drop';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MediaService } from '../core/services/media/media.service';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatGridListModule } from '@angular/material/grid-list';
import { MatListModule } from '@angular/material/list';
import { MatTooltipModule } from '@angular/material/tooltip';
import {MatCheckboxModule} from '@angular/material/checkbox';

import {FormsModule, ReactiveFormsModule} from '@angular/forms';
import {MatSelectModule} from '@angular/material/select';
import {MatFormFieldModule} from '@angular/material/form-field';
import { MAT_DIALOG_DATA, MatDialog, MatDialogModule } from '@angular/material/dialog';
import { AlertComponent } from '../alert.component/alert.component';
import { Router, RouterLink } from '@angular/router';
import { MatSliderModule } from '@angular/material/slider';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatSlideToggle } from '@angular/material/slide-toggle';
import { SpecialCharacterDirective } from '../directives/specialCharacterDirective';
import { CommonService } from '../core/services/common-service';
import { OllamaService } from '../core/services/ollama-service';
import { EStatus } from '../shared/model';
import { SettingsService } from '../core/services/settings-service';

export interface IngestDialogData {
  params: any;
}


@Component({
  selector: 'app-ingest.component',
  imports: [
    TranslateModule,
    MatButtonModule,
    MatInputModule,
    MatToolbar,
    MatIconModule,
    MatChipsModule,
    MatToolbarModule,
    MatProgressSpinnerModule,
    NgxFileDropModule,
    MatProgressBarModule,
    MatGridListModule,
    MatListModule,
    MatTooltipModule,
    MatFormFieldModule,
    MatSelectModule,
    FormsModule,
    ReactiveFormsModule,
    MatSliderModule,
    MatExpansionModule,
    MatSlideToggle,
    SpecialCharacterDirective,
    MatDialogModule,
    MatCheckboxModule,
    MatFabButton
  ],
  templateUrl: './ingest.component.html',
  styleUrl: './ingest.component.scss'
})
export class IngestComponent implements OnInit {
  private _snackBar = inject(MatSnackBar);
  readonly dialog = inject(MatDialog);
  readonly data = inject<IngestDialogData>(MAT_DIALOG_DATA);
  
  fileProgress: number = 0;
  isUploading: boolean = false;
  breakpoint: number = 4;
  
  selectedAll: boolean = false;
  isOpened: boolean = false;
  afterLastFinish: boolean = true;
  collection: string = '';
  showErrors: boolean = false;
  totalUploaded: number = 0;
  filesSize: number = 0;
  loadedSize: number = 0;
  hasOCR: boolean = false;
  addColState: boolean = false;
  
  overallStatus: EStatus | undefined;
  ingestStatus: EStatus = EStatus.not_running;
  
  EStatus: typeof EStatus = EStatus;

  errorOCRStr: string | undefined;

  constructor(
    public systemService: SystemService,
    public commonService: CommonService,
    public settingsService: SettingsService,
    public ollamaService: OllamaService,
    public mediaService: MediaService,
    private router: Router,
    private ngZone: NgZone
  ) {
    this.commonService.get('PAGES.INGEST.OCR_ERROR').then((value: string) => {
      this.errorOCRStr = value;
    })
    effect(() => {
      this.ingestStatus = this.systemService.ingestStatus.get();
      this.overallStatus = this.systemService.mainStatus.get();
      if (this.overallStatus !== EStatus.running_healthy|| this.ingestStatus !== EStatus.not_running) {
        this.systemService.selectedCollections.disable();
        this.systemService.selectedDocuments.disable();
      } else {
        this.systemService.selectedCollections.enable();
        this.systemService.selectedDocuments.enable();
      }
      if (this.systemService.ocrComplete() === true) {
        this.systemService.ocrComplete.set(false);   
        this.hasOCR = false;             
        console.log('Starting ingestion after OCR complete!');
        
        if (this.mediaService.docStatus?.findIndex(f => f.text === this.errorOCRStr) === -1) {
          this.startIngestion();
        }
      }      
      if (this.systemService.hasOCR() === true) {
        console.log('OCR tasks detected, waiting for completion before ingestion!');
        this.systemService.hasOCR.set(false);
        this.hasOCR = true;
        setTimeout(() => {
          this.hasOCR = false;
        }, 600000); // 10 minutes timeout
      }
    });
  }

  async ngOnInit() {
    this.breakpoint = Math.floor(window.innerWidth / 300);
    console.log('breakpoint:', this.breakpoint);
    // console.log('FILES', this.ragFiles);
    this.systemService.MAX_FILES = Number.parseInt(await this.commonService.get('PAGES.INGEST.MAX_DOCS'));
    // console.log('MAX:', this.systemService.MAX_FILES)
    await this.mediaService.createCollection(this.systemService.collection);
    this.systemService.collections = await this.mediaService.getCollections();
    const selectedCollection: any = this.systemService.collections.find(f => f.name === this.systemService.collection).value
    console.log('selected:', selectedCollection);
    this.systemService.selectedCollections.setValue(selectedCollection);
    await this.systemService.refreshFileList(this.mediaService, true);
  }

  resetDefaults = (ev: any) => {
    this.systemService.chunkSize = 512;
    this.systemService.overlap = 48;
    this.systemService.saveChunkSettings();
  }

  startIngestion = async () => {
      console.log('Starting ingestion!');            
      this.systemService.ingestStatus.update(EStatus.starting);
      this.mediaService.docStatus = [];
      this.systemService.saveChunkSettings();

      // Override chunk settings for CSV if they are defaulted
      let ingestParams: any = {
        chunkSize: this.systemService.chunkSize,
        chunkOverlap: this.systemService.overlap,
      }
      if (await this.mediaService.areAllCSV()) {
        console.log('overriding Chunk parameters!');
        ingestParams = {
          chunkSize: 0,
          chunkOverlap: 0
        }
      }

      const ocrentry: any = this.ollamaService.ocr_models.find(f => f.value === this.ollamaService.ocr_model);

      if (this.systemService.ocr_num_ctx && this.systemService.ocr_num_ctx !== 0) {
        ocrentry.params.num_ctx = this.systemService.ocr_num_ctx * 1000;
      }
      this.systemService.commandIngest(
        'start',
        {        
          ...ingestParams, 
          ...{
            separator: this.systemService.separator,
            useSemantic: this.systemService.useSemantic,
            localVector: this.systemService.localVector,
            collection: this.systemService.collection,
            embeddings: this.ollamaService.embeddings_model,
            ocr: { 
              model: this.ollamaService.ocr_model,
              prompt: this.systemService.ocrPrompt && this.systemService.ocrPrompt !== '' ? this.systemService.ocrPrompt : ocrentry.prompt,
              params: ocrentry.params
            }
          }
        }
      ).then(async (result: any) => {
        this.isUploading = false;      
        console.log('ingest result:', result);
        this.afterLastFinish = false;
        setTimeout(() => {
          this.afterLastFinish = true;
        }, 2000);
        await this.mediaService.saveIndex();
        if ((result && result.status === 'completed')) {
          await this.systemService.refreshFileList(this.mediaService, true);
          this.systemService.ingestStatus.update(EStatus.not_running);          
          this.ollamaService.resetChatHistory();
          const snackBarRef = this._snackBar.open(
            await this.commonService.get('PAGES.INGEST.COMPLETE'), 'OK', {
            duration: 10000,
            panelClass: ['ingest-snackbar-positioning']
          });
          this.systemService.commandIngest('blank', {
            collection: this.systemService.collection
          });          
          snackBarRef.onAction().subscribe(() => {            
          });      
        } else if ((result && result.status === 'warning')) {
          this.systemService.ingestStatus.update(EStatus.warning);
          const snackBarRef2 = this._snackBar.open(await this.commonService.get('PAGES.INGEST.WARNING') + ' ' + result.message, 'OK',
          { panelClass: ['ingest-snackbar-positioning'] });
          // await this.systemService.refreshFileList(this.mediaService);
          snackBarRef2.onAction().subscribe(() => {
            this.systemService.ingestStatus.update(EStatus.not_running);
          });      
        }
      }).catch(async (e) => {
        this.isUploading = false;
        console.error('ingest error:', e);      
        this.systemService.ingestStatus.update(EStatus.error);
        const snackBarRef2 = this._snackBar.open(await this.commonService.get('PAGES.INGEST.ERROR') + (e ? (': ' + e.toString()) : ''), 'OK',
        { panelClass: ['ingest-snackbar-positioning'] });
        await this.systemService.refreshFileList(this.mediaService);
        snackBarRef2.onAction().subscribe(() => {
          this.systemService.ingestStatus.update(EStatus.not_running);
        });      
      })     
  }

  progress = async (file: File, data: string | ArrayBuffer | null) => {
    if (data) {
      this.loadedSize += this.mediaService.getFileSize((data as ArrayBuffer).byteLength);
      this.fileProgress = Math.round((this.loadedSize / this.filesSize) * 100);
      // await this.fakeWaiter(Math.floor(Math.random() * 4) + 10);    
      await this.mediaService.uploadChunk(file, Buffer.from(data as ArrayBuffer));
    }          
  }

  fakeWaiter = (ms: number) => {
    return new Promise((resolve) => {
      setTimeout(resolve, ms);
    });
  }

  dropped = async (files: NgxFileDropEntry[]) => {
    console.log('dropped:event:called');
    this.isUploading = true;
    const totalLength: number = files.length + this.systemService.ragFiles.length;
    this.totalUploaded = 0;
    this.fileProgress = 0;
    console.log('TL:', totalLength);
    this.filesSize = 0;
    this.loadedSize = 0;
    
    if (totalLength <= this.systemService.MAX_FILES) {
      for await (const droppedFile of files) {
        if (droppedFile.fileEntry.isFile) {
          const fileEntry = droppedFile.fileEntry as FileSystemFileEntry;          
          await fileEntry.file(async (file: File) => {          
            this.filesSize += this.mediaService.getFileSize(file.size);
        
            try {

              const reader: FileReader = new FileReader();          
              reader.onloadstart = (event: any) => {
                console.log('onloadstart:', file.name);                
                this.systemService.ingestStatus.update(EStatus.uploading);
              };              
              reader.onload = async (event: any) => {
                console.log('onprogress:', file.name);
                await this.progress(file, reader.result);
              };
              reader.onloadend = async (event: any) => {
                console.log('onloadend:', file.name);
                this.totalUploaded += 1;
                console.log('Total uploaded:', file.name, this.totalUploaded, files.length);
                await this.mediaService.completedUpload(file);
                if (this.totalUploaded === files.length) {
                  console.log('total file upload reached!');
                  this.ngZone.run(async () => {
                    await this.systemService.refreshFileList(this.mediaService, true);
                    this.systemService.ingestStatus.update(EStatus.uploaded);
                    setTimeout(() => {
                      this.isUploading = false;
                    }, 60000);
                    console.log('starting ingestion after All files uploaded!', this.systemService.ragFiles);
                    this.startIngestion();               
                  });
                };
              };
              reader.onerror = (event: any) => {
                console.error('onerror:', file.name, event);
                this.isUploading = false;
                this.systemService.ingestStatus.update(EStatus.error);
              };
              reader.onabort = (event: any) => {
                console.warn('onabort:', file.name, event);
                this.isUploading = false;
                this.systemService.ingestStatus.update(EStatus.error);
              };
              
              // Start reading the file which will trigger the onload event 
              await this.mediaService.startUpload(file);
              reader.readAsArrayBuffer(file); // read file as data url
            } finally {
              // this.isUploading = false;
              this.systemService.ingestStatus.update(EStatus.uploaded);
            }
            
          });          
        } else {
          const fileEntry = droppedFile.fileEntry as FileSystemDirectoryEntry;
          console.log(droppedFile.relativePath, fileEntry);
          this.isUploading = false;
          this._snackBar.open(await this.commonService.get('PAGES.INGEST.DIR_NOT_SUPPORTED'), 'OK',
          {
            panelClass: ['ingest-snackbar-positioning']
          });
        }
      }
    } else {
      this.isUploading = false;
      this._snackBar.open(await this.commonService.get('PAGES.INGEST.TOO_MANY_FILES') + this.systemService.MAX_FILES, 'OK',
        {
          panelClass: ['ingest-snackbar-positioning']
        });
    }    
  }

  fileOver = (event: any) => {
    console.log(event);
  }

  fileLeave = (event: any) => {
    console.log(event);
  }    
  
  onResize = (event: any) => {
    this.breakpoint = Math.floor(event.target.innerWidth / 300);
  }

  fileRemove = async (event: any) => {
    console.log('fileRemove:', event);
    if (this.systemService.selectedDocuments.value) {
      const docs: string[] = (this.systemService.selectedDocuments.value as unknown) as string[];
      const deleteStr: string = docs.map(doc => this.commonService.basename(doc)).join(', ');
      console.log('fileRemove:', deleteStr)    
      const dialogRef = this.dialog.open(
        AlertComponent, {
          data: {
            type: 1,
            params: {
              message: await this.commonService.get('PAGES.INGEST.DELETE_ARE_YOU_SURE') + ' ' + deleteStr
            }
          }
        });
      dialogRef.afterClosed().subscribe(async (result) => {
        console.log(`Dialog result: ${result}`);
        if (result === true) {          
          for await (const doc of docs) {
            const fIdx: number = this.systemService.ragFiles.findIndex(r => r.name === doc);
            if (fIdx > -1) {
              await this.mediaService.remove(this.systemService.ragFiles[fIdx].name);
              this.systemService.ragFiles.splice(fIdx, 1);            
            }
          }
          await this.systemService.refreshFileList(this.mediaService, true);
          this.startIngestion();
        }
        this.systemService.selectedDocuments.setValue('');
      });    
    }
  }

  removeChecked = async (event: any) => {
    console.log('remove: checked files:');
    const docs: string [] = this.mediaService.filesChecked.map((m, i) => m ? this.systemService.ragFiles[i].name : '').filter(f => f !== '');
    const dialogRef = this.dialog.open(
      AlertComponent, {
        data: {
          type: 1,
          params: {
            message: await this.commonService.get('PAGES.INGEST.DELETE_ARE_YOU_SURE') + ' ' + docs.map(m => this.commonService.basename(m)).join(', ')
          }
        }
      });
    dialogRef.afterClosed().subscribe(async (result) => {
      console.log(`Dialog result: ${result}`);
      if (result === true) {                
        for await (const doc of docs) {
          const fIdx: number = this.systemService.ragFiles.findIndex(r => r.name === doc);
          if (fIdx > -1) {
            await this.mediaService.remove(this.systemService.ragFiles[fIdx].name);
            this.systemService.ragFiles.splice(fIdx, 1);
          }
        }
        await this.systemService.refreshFileList(this.mediaService, true);
        /*
        // NOT REQUIRED since we filter for only selected documents
        if (this.systemService.ragFiles.length > 0) {
          this.startIngestion();
        }
        */
      }
    });    
  }

  download = async (event: any, index: number) => {}

  toggleOpen = (event: any) => {
    this.isOpened = !this.isOpened;
    console.log('opened:', this.isOpened);
  }

  toggleAll = (event: any) => {
    console.log(event.target.value);
    this.selectedAll = !this.selectedAll;
  }

  docsHealthy = (): boolean => {  
    if (this.mediaService.docStatus && this.afterLastFinish) {
      return this.mediaService.docStatus.reduce(
        ((acc: boolean, cur: any) => acc && cur.status < 2),
        true
      );      
    } else {
      return false;
    }
  }

  hasChecked = (): boolean => {
    return this.mediaService.filesChecked.reduce(((a: boolean, c: boolean) => a || c ), false);
  }

  newCollection = async (ev: any) => {
    if (this.collection.length > 7) {
      this.showErrors = false;
      const dialogRef = this.dialog.open(
        AlertComponent, {
          data: {
            type: 1,
            params: {
              message: await this.commonService.get('PAGES.INGEST.CREATE_ARE_YOU_SURE') + ' ' + this.collection
            }
          }
        });
      dialogRef.afterClosed().subscribe(async (result) => {
        console.log(`Dialog result: ${result}`);
        if (result === true && !this.systemService.collections.find(f => f.name === this.collection)) {
          await this.mediaService.createCollection(this.collection);
          this.systemService.collections = await this.mediaService.getCollections();
          const selectedCollection = this.systemService.collections.find(f => f.name === this.collection).value;
          console.log('selectedCollection:', this.collection, selectedCollection);
          this.systemService.selectedCollections.setValue(selectedCollection);
          this.systemService.collection = this.collection;          
          await this.systemService.refreshFileList(this.mediaService, true);
          console.log('ragFiles:', this.systemService.ragFiles);
          this.addColState = false;
        } else {
          console.log('collection already exists!:', this.collection)
        }
        this.collection = '';
        await this.systemService.saveChunkSettings();
      });    
    }    
  }

  changeCollection = async (ev: any) => {
    this.systemService.collection = this.systemService.selectedCollections.value ? this.commonService.basename(this.systemService.selectedCollections.value) : 'general';
    console.log('change to collection:', this.systemService.collection)
    await this.systemService.saveChunkSettings();
    this.mediaService.loadedIndex = false;    
   await this.systemService.refreshFileList(this.mediaService, true);
  }

  collectionRemove = async (ev: any) => {
    const selectedCollection = this.systemService.collections.find(f => f.name === this.systemService.collection).value;
    console.log('remove collection:', selectedCollection)
    const dialogRef = this.dialog.open(
        AlertComponent, {
          data: {
            type: 1,
            params: {
              message: await this.commonService.get('PAGES.INGEST.REMOVE_COLLECTION_ARE_YOU_SURE') + ' ' + this.systemService.collection
            }
          }
        });
      dialogRef.afterClosed().subscribe(async (result) => {
        console.log(`Dialog result: ${result}`);
        if (result === true) {      
          await this.mediaService.deleteIndex();
          await this.mediaService.remove(selectedCollection);           
          this.systemService.collections = await this.mediaService.getCollections();
          this.systemService.collection = "general";
          const generalCollection = this.systemService.collections.find(f => f.name === this.systemService.collection).value;
          this.systemService.selectedCollections.setValue(generalCollection);
          await this.systemService.refreshFileList(this.mediaService);
          await this.systemService.saveChunkSettings();
        }
      });
  }

  switchQuantum = async (event: any) => {    
    const dialogRef = this.dialog.open(
      AlertComponent, {
        data: {
          type: 1,
          params: {
            message: await this.commonService.get('QUANTUM_ARE_YOU_SURE')
          }
        }
      });
    dialogRef.afterClosed().subscribe(async (result) => {
      console.log(`Dialog result: ${result}`);
      if (result === true) {            
        this.systemService.useQuantum = event.checked;
        await this.commonService.setEnvValue('QUANTUM_ENC', this.systemService.useQuantum ? 'true' : 'false');
          const dialogRef = this.dialog.open(
            AlertComponent, {
              data: {
                type: 2,
                params: {
                  message: await this.commonService.get('QUANTUM_CHANGE_DONE')
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
}

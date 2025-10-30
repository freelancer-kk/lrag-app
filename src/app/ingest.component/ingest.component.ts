import { Component, OnInit, inject, effect } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
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

import {FormsModule, ReactiveFormsModule} from '@angular/forms';
import {MatSelectModule} from '@angular/material/select';
import {MatFormFieldModule} from '@angular/material/form-field';
import { MatDialog } from '@angular/material/dialog';
import { AlertComponent } from '../alert.component/alert.component';
import { Router, RouterLink } from '@angular/router';
import { MatSliderModule } from '@angular/material/slider';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatSlideToggle } from '@angular/material/slide-toggle';
import { SpecialCharacterDirective } from '../directives/specialCharacterDirective';
import { CommonService } from '../core/services/common-service';
import { OllamaService } from '../core/services/ollama-service';
import { EStatus } from '../shared/model';

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
    SpecialCharacterDirective
  ],
  templateUrl: './ingest.component.html',
  styleUrl: './ingest.component.scss'
})
export class IngestComponent implements OnInit {
  private _snackBar = inject(MatSnackBar);
  readonly dialog = inject(MatDialog);
  fileProgress: number = 0;
  isUploading: boolean = false;
  breakpoint: number = 4;
  startIngestTimer: any;
  ingestStatus: string = 'not running';
  selectedAll: boolean = false;
  isOpened: boolean = false;
  afterLastFinish: boolean = true;
  collection: string = '';
  showErrors: boolean = false;

  overallStatus: EStatus | undefined;

  EStatus: typeof EStatus = EStatus;

  constructor(
    public systemService: SystemService,
    public commonService: CommonService,
    public ollamaService: OllamaService,
    public mediaService: MediaService,
    private router: Router,
  ) {
    effect(() => {
      this.ingestStatus = this.systemService.ingestStatus();
      this.overallStatus = this.systemService.mainStatus.get();
      if (this.overallStatus !== EStatus.running_healthy|| this.ingestStatus !== 'not running') {
        this.systemService.selectedCollections.disable();
        this.systemService.selectedDocuments.disable();
      } else {
        this.systemService.selectedCollections.enable();
        this.systemService.selectedDocuments.enable();
      }
    })
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
    this.systemService.ragFiles = await this.mediaService.ls();
  }

  resetDefaults = (ev: any) => {
    this.systemService.chunkSize = 512;
    this.systemService.overlap = 48;
    this.systemService.saveChunkSettings();
  }

  startIngestion = async () => {
    this.systemService.ingestStatus.update(() => 'starting');
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

    this.systemService.commandIngest(
      'start',
      {        
        ...ingestParams, 
        ...{
          separator: this.systemService.separator,
          useSemantic: this.systemService.useSemantic,
          localVector: this.systemService.localVector,
          collection: this.systemService.collection,
          embeddings: this.ollamaService.embeddings_model
        }
      }
    ).then(async (result: any) => {
      console.log('ingest result:', result);
      this.afterLastFinish = false;
      setTimeout(() => {
        this.afterLastFinish = true;
      }, 10000);
      await this.mediaService.saveIndex();
      if ((result && result.status === 'completed')) {
        this.systemService.ingestStatus.update(() => 'not running');
        this.systemService.ragFiles = await this.mediaService.ls();
        const snackBarRef = this._snackBar.open(await this.commonService.get('PAGES.INGEST.COMPLETE'), 'OK', {
          duration: 10000
        });
        snackBarRef.onAction().subscribe(() => {
          if (this.mediaService.noOfValidFiles()) {
            this.router.navigate(['insights']);
          }
        });      
      } else {
        this.systemService.ingestStatus.update(() => 'warning');
        const snackBarRef1 = this._snackBar.open(await this.commonService.get('PAGES.INGEST.WARNING') + (result.status ? (': ' + JSON.stringify(result)) : await this.commonService.get('PAGES.INGEST.EXITED')), 'OK' );
        this.systemService.ragFiles = await this.mediaService.ls();
        snackBarRef1.onAction().subscribe(() => {
          this.systemService.ingestStatus.update(() => 'not running');
        });              
      }
    }).catch(async (e) => {
      console.error('ingest error:', e);      
      this.systemService.ingestStatus.update(() => 'error');
      const snackBarRef2 = this._snackBar.open(await this.commonService.get('PAGES.INGEST.ERROR') + (e ? (': ' + e.toString()) : ''), 'OK' );
      this.systemService.ragFiles = await this.mediaService.ls();
      snackBarRef2.onAction().subscribe(() => {
        this.systemService.ingestStatus.update(() => 'not running');
      });      
    })    
  }

  progress = async (file: File, data: string | ArrayBuffer | null) => {
    let fileSize = this.mediaService.getFileSize(file.size);
    let fileSizeInWords = this.mediaService.getFileSizeUnit(file.size);
    
    for (
      var f = 0;
      f < fileSize + fileSize * 0.0001;
      f += fileSize * 0.01
    ) {
      this.fileProgress = Math.round((f / fileSize) * 100);
      // await this.fakeWaiter(Math.floor(Math.random() * 20) + 1);
      if (data) {
        // console.log(file.FileProgress, Buffer.from(data as ArrayBuffer).length);
        await this.mediaService.uploadChunk(file, Buffer.from(data as ArrayBuffer));
      }
      if (this.fileProgress === 100) {
        console.log('completed');
        await this.mediaService.completedUpload(file);
        this.isUploading = false;
        this.systemService.ingestStatus.update(() => 'uploaded');
        if (this.startIngestTimer) {
          clearTimeout(this.startIngestTimer);
        }
        this.startIngestTimer = setTimeout(async () => {   
          this.systemService.ragFiles = await this.mediaService.ls(true);
          this.startIngestion();  
        }, 2500)        
      }
    }
  }

  fakeWaiter = (ms: number) => {
    return new Promise((resolve) => {
      setTimeout(resolve, ms);
    });
  }

  dropped = async (files: NgxFileDropEntry[]) => {
    const totalLength: number = files.length + this.systemService.ragFiles.length;
    console.log('TL:', totalLength);
    if (totalLength <= this.systemService.MAX_FILES) {
      for (const droppedFile of files) {
        if (droppedFile.fileEntry.isFile) {
          const fileEntry = droppedFile.fileEntry as FileSystemFileEntry;
          fileEntry.file(async (file: File) => {
            console.log(droppedFile.relativePath, file);

            try {
              const reader: FileReader = new FileReader();          
              reader.onload = (event: any) => {
                this.isUploading = true;
                this.systemService.ingestStatus.update(() => 'uploading');
                this.progress(file, reader.result);
              };
              await this.mediaService.startUpload(file);
              reader.readAsArrayBuffer(file); // read file as data url
            } finally {
              this.isUploading = false;
              this.systemService.ingestStatus.update(() => 'uploaded');
            }
            
          });          
        } else {
          const fileEntry = droppedFile.fileEntry as FileSystemDirectoryEntry;
          console.log(droppedFile.relativePath, fileEntry);
          this._snackBar.open(await this.commonService.get('PAGES.INGEST.DIR_NOT_SUPPORTED'), 'OK');
        }
      }
    } else {
      this._snackBar.open(await this.commonService.get('PAGES.INGEST.TOO_MANY_FILES') + this.systemService.MAX_FILES, 'OK');
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
      const deleteStr: string = docs.map(doc => this.commonService.basename(doc)).join(' ');
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
          this.systemService.ragFiles = await this.mediaService.ls(true);
          // await this.startIngestion();
        }
        this.systemService.selectedDocuments.setValue('');
      });    
    }
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
          this.systemService.ragFiles = await this.mediaService.ls(true);
          console.log('ragFiles:', this.systemService.ragFiles);
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
    this.systemService.ragFiles = await this.mediaService.ls(true);    
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
          this.systemService.ragFiles = await this.mediaService.ls(true);
          await this.systemService.saveChunkSettings();
        }
      });
  }
}

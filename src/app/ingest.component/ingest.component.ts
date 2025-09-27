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
    ReactiveFormsModule
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
  overallStatus: string = 'not running';

  constructor(
    public systemService: SystemService,
    private mediaService: MediaService
  ) {
    effect(() => {
      this.ingestStatus = this.systemService.ingestStatus();
      this.overallStatus = this.systemService.overallStatus();
    })
  }

  async ngOnInit() {
    this.breakpoint = Math.floor(window.innerWidth / 300);
    console.log('breakpoint:', this.breakpoint);
    if (this.systemService.ragFiles.length === 0) {
      this.systemService.ragFiles = await this.mediaService.ls();
    }    
    // console.log('FILES', this.ragFiles);
    this.systemService.MAX_FILES = Number.parseInt(await this.systemService.get('PAGES.INGEST.MAX_DOCS'));
    // console.log('MAX:', this.systemService.MAX_FILES)
  }

  startIngestion = async () => {
    this.systemService.ingestStatus.update(() => 'starting');
    this.systemService.commandIngest('start').then(async (result: any) => {
      console.log('ingest result:', result);
      if (result && result.status === 'completed') {
        this.systemService.ingestStatus.update(() => 'not running');
        this.systemService.ragFiles = await this.mediaService.ls();
      } else {
        this.systemService.ingestStatus.update(() => 'error');
        const snackBarRef = this._snackBar.open(await this.systemService.get('PAGES.INGEST.ERROR') + (result ? (': ' + JSON.stringify(result)) : ''), 'OK' );
        snackBarRef.onAction().subscribe(() => {
          this.systemService.ingestStatus.update(() => 'not running');
        });
      }
    }).catch(async (e) => {
      console.error('ingest error:', e);
      this.systemService.ingestStatus.update(() => 'error');
      const snackBarRef = this._snackBar.open(await this.systemService.get('PAGES.INGEST.ERROR') + (e ? (': ' + e.toString()) : ''), 'OK' );
      snackBarRef.onAction().subscribe(() => {
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
        this.startIngestTimer = setTimeout(() => {          
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
          this._snackBar.open(await this.systemService.get('PAGES.INGEST.DIR_NOT_SUPPORTED'));
        }
      }
    } else {
      this._snackBar.open(await this.systemService.get('PAGES.INGEST.TOO_MANY_FILES') + this.systemService.MAX_FILES);
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
    if (this.systemService.selectedDocuments.value) {
      const docs: string[] = (this.systemService.selectedDocuments.value as unknown) as string[];
      const deleteStr: string = docs.join(' ');
      console.log('fileRemove:', deleteStr)    
      const dialogRef = this.dialog.open(
        AlertComponent, {
          data: {
            type: 1,
            params: {
              message: await this.systemService.get('PAGES.INGEST.DELETE_ARE_YOU_SURE') + ' ' + deleteStr
            }
          }
        });
      dialogRef.afterClosed().subscribe(async (result) => {
        console.log(`Dialog result: ${result}`);
        if (result === true) {          
          for await (const doc of docs) {
            const fIdx: number = this.systemService.ragFiles.findIndex(r => r === doc);
            if (fIdx > -1) {
              await this.mediaService.remove(this.systemService.ragFiles[fIdx]);
              this.systemService.ragFiles.splice(fIdx, 1);            
            }
          }
          await this.startIngestion();
        }
        this.systemService.selectedDocuments.setValue('');
      });    
    }
  }
}

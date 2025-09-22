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
    MatListModule
  ],
  templateUrl: './ingest.component.html',
  styleUrl: './ingest.component.scss'
})
export class IngestComponent implements OnInit {
  private _snackBar = inject(MatSnackBar);
  fileProgress: number = 0;
  isUploading: boolean = false;
  breakpoint: number = 4;
  startIngestTimer: any;
  wt: any;

  constructor(
    public systemService: SystemService,
    private mediaService: MediaService
  ) {
    effect(() => {
      
    })
  }

  showDownloadImageWarning = (message: string) => {
    this.wt = setTimeout(async () => {
      this.wt = undefined
      this._snackBar.open(
        message,        
        await this.systemService.get('OK')
      );
    }, 1000)
  }

  clearDownloadImageWarning = () => {
    if (this.wt) {
      clearTimeout(this.wt);
    }    
  }

  async ngOnInit() {
    this.breakpoint = Math.floor(window.innerWidth / 300);
    console.log('breakpoint:', this.breakpoint);
    if (this.systemService.ragFiles.length === 0) {
      this.systemService.ragFiles = await this.mediaService.ls();
    }
    this.getUnstructuredStatus();
    // console.log('FILES', this.ragFiles);
    this.systemService.MAX_FILES = Number.parseInt(await this.systemService.get('PAGES.INGEST.MAX_DOCS'));
    // console.log('MAX:', this.systemService.MAX_FILES)
  }

  getUnstructuredStatus = async (): Promise<any> => {
  }

  startUnstructured = async () => {
    await this.getUnstructuredStatus();
    try {
      if (this.systemService.ingestStatus() === 'not running') {
        this.systemService.ingestStatus.update(() => "starting");    

      } else if (this.systemService.ingestStatus() === 'exited' || this.systemService.ingestStatus() === 'die') {
        this.showDownloadImageWarning(await this.systemService.get('PAGES.INGEST.DURATION_WARNING'));
        this.systemService.ingestStatus.update(() => "running");
      }
    } catch(e: any) {
      console.error(e);
      if (e.result && e.result.json && e.result.json.message && e.result.json.message.toLowerCase().startsWith('no such image')) {
        this.systemService.ingestStatus.update(() =>'downloading unstructured image');
        this.showDownloadImageWarning(await this.systemService.get('APP.DOWNLOAD_IMAGE_WARNING'));                
      }
    }
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
        if (this.startIngestTimer) {
          clearTimeout(this.startIngestTimer);
        }
        this.startIngestTimer = setTimeout(() => {          
          this.startUnstructured();  
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
                this.progress(file, reader.result);
              };
              await this.mediaService.startUpload(file);
              reader.readAsArrayBuffer(file); // read file as data url
            } finally {
              this.isUploading = false;
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

  fileRemove = async (event: any, index: number) => {
    if ((this.systemService.overallStatus())) {
      console.log('remove file:', this.systemService.ragFiles[index]);
      await this.mediaService.remove(this.systemService.ragFiles[index]);
      await this.startUnstructured();
      this.systemService.ragFiles.splice(index, 1);
    }
  }
}

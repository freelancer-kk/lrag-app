import { ipcMain } from 'electron';
import * as path from 'path';
import * as fs from 'fs';

import { isMac, isWindows } from './SystemInfo';
import DepService from './DepService';

export default class WatcherService {
  serviceInstance: DepService;
  webContents: Electron.WebContents | undefined;
  rootDir: string;
  isServiceReady: boolean = false;
  
  constructor(
    installedVersion: string,
    availableVersion: string,
    darwin_dl: string,
    default_dl: string,
    ghostscript_available_version: string,
    ghostscript_win_download_link: string,
    homebrew_mac_download_link: string,
    homebrew_mac_available_version: string,
    ghostscript_mac_download_link: string,
    dataRootPath: string,
    userTempPath: string,
    appDataPath: string,
    versionCB: () => void
  ) {

    let execDir: string = path.join(appDataPath, 'watcher', 'dist');
    let executable: string = "watcher.exe";
    let args: string[] = [];
    let urls: string[] = [];
    
    this.rootDir = dataRootPath;
    if (!fs.existsSync(this.rootDir)) {
      fs.mkdirSync(this.rootDir, { recursive: true });
    }
              
    const inputDir = path.join(dataRootPath, 'input');
    const outputDir = path.join(dataRootPath, 'output');
    const processedDir = path.join(dataRootPath, 'processed');
    const errorDir = path.join(dataRootPath, 'error');

    if (!fs.existsSync(inputDir)) {
      fs.mkdirSync(inputDir, { recursive: true });
    }
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    if (!fs.existsSync(processedDir)) {
      fs.mkdirSync(processedDir, { recursive: true });
    }
    if (!fs.existsSync(errorDir)) {
      fs.mkdirSync(errorDir, { recursive: true });
    }
    
    const watcherEnv: any = {
      ...process.env,
      ...{
        'OCR_INPUT_DIRECTORY': inputDir,
        'OCR_OUTPUT_DIRECTORY': outputDir,
        'OCR_ERROR_DIRECTORY': errorDir,
        'OCR_ARCHIVE_DIRECTORY': processedDir,
        'OCR_ON_SUCCESS_DELETE': 'True',
        'OCR_DESKEW': 'True',
        'OCR_USE_POLLING': 'True',
        'OCR_POLL_NEW_FILE_SECONDS': 5,
        'OCR_RETRIES_LOADING_FILE': 50,
      }
    };

    if (isWindows) {
      urls = [default_dl];
    } else {
      urls = [darwin_dl];
      // execDir = path.join(appDataPath,'watcher','dist','watcher.app','Contents','MacOS');            
      execDir = "/Users/kabirkhaleque/projects/lrag-docker-services/dist/watcher.app/Contents/MacOS";
      executable = 'watcher';
      args = [
        '--error-dir=\"' + errorDir + '\"',
        '--input-dir=\"' + inputDir + '\"',
        '--output-dir=\"' + outputDir + '\"',
        '--archive-dir=\"' + processedDir + '\"',
        '--on-success-delete',
        '--deskew',
        '--poll-new-file-seconds=5',
        '--use-polling',
        '--retries-loading-file=50'
      ]
    }

    // console.log('WatcherService:env:', watcherEnv);

    this.serviceInstance = new DepService(
      "watcher",
      "watcher",
      executable,      
      execDir,
      args,
      appDataPath,
      userTempPath,
      urls,
      async (): Promise<boolean> => {
        return Promise.resolve(this.isServiceReady);
      },
      [{
         name: 'homebrew',
         mac: {
            url: homebrew_mac_download_link,
            cwd: '.',
            args: [
              '--version'
            ],
            executable: '/opt/homebrew/bin/brew',
            expected_version: homebrew_mac_available_version
         }
        },{
         name: 'tesseract',
         win: {
            winget: '--silent --disable-interactivity --accept-source-agreements -e --id UB-Mannheim.TesseractOCR',
            cwd: '\\Program Files\\Tesseract-OCR',
            args: [
              '--version'
            ],
            executable: 'tesseract.exe',
            expected_version: 'tesseract'
         }
        },{
         name: 'ghostscript',
         win: {
            url: ghostscript_win_download_link,
            cwd: '.',
            args: ['--version'],
            executable: 'gswin64c.exe',
            expected_version: ghostscript_available_version
         },
         mac: {
            brew: 'ghostscript tesseract-lang',    
            cwd: '.',
            args: ['--version'],
            executable: '/opt/homebrew/bin/gs',
            expected_version: ghostscript_available_version
         }
      }],
      installedVersion,
      availableVersion,
      versionCB,
      (text: string) => {
        if (text.startsWith('Polling ')) {
          console.log('Watcher:service:isready!')
          this.isServiceReady = true;
        }
      },
      watcherEnv
    )
  }

  register = (webContents: Electron.WebContents | undefined) => {
    this.webContents = webContents;
    this.serviceInstance.register(this.webContents);
    ipcMain.on('service-watcher', async (event: any, arg: any) => {
      const { callbackId, command, params }= arg;
      console.log('watcher:', callbackId, command, params)
      let response: any = {}
      try {
        switch (command) {
          default: {
            response = await this.serviceInstance.handleCommand(event, arg);
          } 
        }
      } catch (e) {
        console.error(e);
        response.error = e;
      }
      response.command = command;
      response.params = params;
      event.reply('reply', {
        callbackId,
        response: JSON.stringify(response)
      })
    }) 
  }
  
  install = (): Promise<boolean> => {
    return this.serviceInstance.install();
  }

  startIfInstalled = () => {
    this.serviceInstance.startIfInstalled();
  }

  stop = (): Promise<any> => {
    return this.serviceInstance.stop(true);
  }

  isReady = (): boolean => {
    return this.serviceInstance.isReady
  }

  list = (relativeDirPath: string): string[] => {
    return fs.readdirSync(path.join(this.rootDir, relativeDirPath));
  }

  put = (sourcefile: string, targetfile: string) => {
    fs.copyFileSync(sourcefile, path.join(this.rootDir, targetfile));
  }

  delete = (remotefile: string) => {
    fs.rmSync(path.join(this.rootDir, remotefile));
  }

  exists = (remotefile: string): boolean => {
    return fs.existsSync(path.join(this.rootDir,remotefile));
  }

  get = (remotefile: string, localfile: string) => {
    fs.copyFileSync(path.join(this.rootDir, remotefile), localfile);
  }
}
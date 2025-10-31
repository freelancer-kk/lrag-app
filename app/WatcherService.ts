import { ipcMain } from 'electron';
import * as path from 'path';
import * as fs from 'fs';

import { isWindows } from './SystemInfo';
import DepService from './DepService';

export default class WatcherService {
  serviceInstance: DepService;
  webContents: Electron.WebContents | undefined;
  rootDir: string;
  
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
    
    const dataPath = path.join(dataRootPath, 'watcher');
    this.rootDir = dataPath;
    const inputDir = path.join(dataPath, 'input');
    const outputDir = path.join(dataPath, 'output');
    const processedDir = path.join(dataPath, 'processed');
    const errorDir = path.join(dataPath, 'error');

    fs.mkdirSync(inputDir, { recursive: true });
    fs.mkdirSync(outputDir, { recursive: true });
    fs.mkdirSync(processedDir, { recursive: true });
    fs.mkdirSync(errorDir, { recursive: true });
    
    if (isWindows) {
      urls = [default_dl];
    } else {
      urls = [darwin_dl];
      executable = 'watcher.app';    
    }

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
        // TODO: Think of an appropriate health check for the python ocr service        
        return Promise.resolve(true);
      },
      [{
         name: 'homebrew',
         mac: {
            url: homebrew_mac_download_link,
            cwd: '.',
            args: ['--version'],
            executable: 'brew',
            expected_version: homebrew_mac_available_version
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
            url: ghostscript_mac_download_link,
            cwd: '.',
            args: ['--version'],
            executable: 'gs',
            expected_version: ghostscript_available_version
         }
      }],
      installedVersion,
      availableVersion,
      versionCB,
      {
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
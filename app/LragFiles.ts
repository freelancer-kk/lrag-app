import { ipcMain } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import log from 'electron-log/main';

export default class LRagFiles {
  docPath: string;
  dataPath: string;
  
  constructor(docPath: string | undefined, dataPath: string | undefined) {
    log.info('LRagFiles:constructor:')
    if (docPath) {
      this.docPath = docPath;
      if (!fs.existsSync(this.docPath)) {
        fs.mkdirSync(this.docPath, { recursive: true });
      }
      try {
        if (!fs.existsSync(path.join(this.docPath, 'general'))) {
          fs.mkdirSync(path.join(this.docPath, 'general'));
        }
      } catch (ce) {
        log.error(ce);
      }
    } else {
      this.docPath = '';
    }
    this.dataPath = dataPath ? dataPath: '';
    log.info('LRagFiles:', this.docPath, this.dataPath);
  }

  ls = (path: string, params: any): string[] => {    
    const dirents: fs.Dirent[] = fs.readdirSync(path, {
      withFileTypes: true
    });
    return dirents.filter(d => params.dirOnly ? d.isDirectory() : d.isFile()).map(d => d.name);
  }

  register = () => {
      ipcMain.on('lragfiles', async (event: any, arg: any) => {
        const { callbackId, command, params }= arg;
        const fullPath: string = path.join(this.docPath, params.collection ? params.collection : '', params.name ? params.name : '');
        let response: any = {}
        switch (command) {
          case "start": {
            log.info('LRagFiles:', callbackId, command);
            if (fs.existsSync(fullPath)) {
              fs.unlinkSync(fullPath);
            }
            response = {
              fullPath
            }
          }
          break;
          case "end": {
            log.info('LRagFiles:', callbackId, command);
            log.info('written:', fullPath);
            response = {
              fullPath
            }
          }
          break;
          case "chunk": {
            response = await (new Promise((resolve, reject) => {
              try {
                fs.appendFile(
                  fullPath,
                  Buffer.from(params.chunk),
                  {
                    encoding: 'binary',
                  },
                  (err) => {
                    if (err) {
                      reject({
                        error: err,
                        success: false
                      });
                    }
                    resolve({
                      success: true
                    });                    
                  }
                )
              } catch (e) {
                reject({
                  error: e,
                  success: false
                });
              }              
            }));
          }
          break;
          case "ls": {
            log.info('LRagFiles:', callbackId, command, fullPath);
            response = this.ls(fullPath, params).map(f => path.join(fullPath, f));
          }
          break;
          case "rootpath": {
            response = this.docPath;
          }
          break;
          case "mkdir": {
            log.info('LRagFiles:', callbackId, command, fullPath);
            try {
              if (!fs.existsSync(fullPath)) {
                response = fs.mkdirSync(fullPath, { recursive: true });
              } else {
                response = { fullPath };
              }
            } catch (e) {
              log.error(e);
            }
          }
          break;
          case "rm": {
            log.info('LRagFiles:', callbackId, command, params.name);
            try {
              fs.rmSync(params.name, {
                recursive: true,
                force: true,
              });
              response = {
                success: true
              }
            } catch (e) {
              response = {
                error: e,
                success: false
              }
            }
          }
          break;
          case "cleanData": {
            log.info('LRagFiles:clean:removing:', callbackId, this.dataPath);
            try {
              fs.rmSync(this.dataPath, {
                recursive: true,
                force: true
              });
              fs.rmSync(this.docPath, {
                recursive: true,
                force: true
              });
              fs.mkdirSync(this.docPath, { recursive: true });
              response = {
                success: true
              }
            } catch (e) {
              response = {
                error: e,
                success: false
              }
            }
          }
          break;
        }
        event.reply(
          'reply', 
          {
            callbackId,
            response: JSON.stringify(response)
          })
      }) 
    }
}
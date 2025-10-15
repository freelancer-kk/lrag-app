import { ipcMain } from 'electron';
import * as path from 'path';
import * as fs from 'fs';

export default class LRagFiles {
  docPath: string;
  dataPath: string;
  
  constructor(docPath: string | undefined, dataPath: string | undefined) {
    console.log('LRagFiles:constructor:')
    if (docPath) {
      this.docPath = docPath;
      fs.mkdirSync(this.docPath, { recursive: true });
    } else {
      this.docPath = '';
    }
    this.dataPath = dataPath ? dataPath: '';
    console.log('LRagFiles:', this.docPath, this.dataPath);
  }

  ls = (path: string): string[] => {
    return fs.readdirSync(path);
  }

  register = () => {
      ipcMain.on('lragfiles', async (event: any, arg: any) => {
        const { callbackId, command, params }= arg;
        const fullPath: string = path.join(this.docPath, params.name ? params.name : '');
        let response: any = {}
        switch (command) {
          case "start": {
            console.log('LRagFiles:', callbackId, command);
            if (fs.existsSync(fullPath)) {
              fs.unlinkSync(fullPath);
            }
            response = {
              fullPath
            }
          }
          break;
          case "end": {
            console.log('LRagFiles:', callbackId, command);
            console.log('written:', fullPath);
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
            console.log('LRagFiles:', callbackId, command);
            response = this.ls(fullPath);
          }
          break;
          case "rm": {
            console.log('LRagFiles:', callbackId, command);
            try {
              fs.unlinkSync(fullPath);
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
            console.log('LRagFiles:clean:removing:', callbackId, this.dataPath);
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
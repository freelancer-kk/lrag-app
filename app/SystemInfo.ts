import { app, ipcMain, shell } from 'electron';
import { cpu, graphics, mem, Systeminformation } from 'systeminformation';
import * as nodeDiskInfo from 'node-disk-info';
import { platform } from 'os';
import log from 'electron-log/main';
import { machineIdSync } from 'node-machine-id';

export const isMac: boolean = platform() === "darwin";
export const isWindows: boolean = platform() === "win32";
export const isLinux: boolean = platform() === "linux";

export default class SystemInfo {
  webContents: Electron.WebContents | undefined;
  private graphics: Systeminformation.GraphicsData | undefined;
  private mem: Systeminformation.MemData | undefined;
  tools: any;
  id: string;

  constructor(tools: any) {
    this.tools = tools;
    this.id = machineIdSync(true);
  }

  getGraphics = async (): Promise<Systeminformation.GraphicsData> => {
    this.graphics = await graphics();
    return this.graphics;
  }

  getTotalMemory = async (): Promise<number> => {
    this.mem = await mem();
    return this.mem.total;
  }

  emit = (args: any) => {
    this.webContents?.send('event', {
      response: args
    })                
  }

  register = (webContents: Electron.WebContents | undefined) => {
    this.webContents = webContents;
    ipcMain.on('system', async (event: any, arg: any) => {
      const { callbackId, command, params }= arg;
      log.info('system:', callbackId, command, params)
      let response: any = {}
      switch (command) {
        case "mem": {
          response = this.mem ? this.mem : await mem();
        }
        break;
        case "cpu": {
          response = {
            ...{ machineId: this.id },
            ...(await cpu())
          };
        }
        break;
        case "disks": {
          response = nodeDiskInfo.getDiskInfoSync();            
        }
        break;
        case "os": {
          response = this.getOsTypes();
        }
        break;
        case "id": {
          response = this.id;
        }
        break;
        case "open": {
          if (params.url === 'TOOL') {
            await shell.openExternal(this.tools[params.var]);
          } else {
            await shell.openExternal(params.url);
          }
          this.emit({ 
            type: 'after-link-opened',
            data: params
          });
          response = {
            status: 'ok'
          }
        }
        break;
        case "quit": {
          app.quit();
          response = {
            status: 'exit'
          }
        }
        break;
        default:
          response = this.graphics;
      }
      event.reply('reply', {
        callbackId,
        response: JSON.stringify(response)
      })
    }) 
  }

  getOsTypes = (): any => {
    return {
      isMac,
      isWindows,
      isLinux
    }
  }
}
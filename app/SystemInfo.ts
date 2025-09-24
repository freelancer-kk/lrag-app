import { ipcMain } from 'electron';
import { cpu, graphics, mem, Systeminformation } from 'systeminformation';
import * as nodeDiskInfo from 'node-disk-info';
import { platform } from 'os';

export const isMac: boolean = platform() === "darwin";
export const isWindows: boolean = platform() === "win32";
export const isLinux: boolean = platform() === "linux";

export default class SystemInfo {
  private graphics: Systeminformation.GraphicsData | undefined;
  constructor() {}

  getGraphics = async (): Promise<Systeminformation.GraphicsData> => {
    this.graphics = await graphics();
    return this.graphics;
  }

  register = () => {
    ipcMain.on('system', async (event: any, arg: any) => {
      const { callbackId, command, params }= arg;
      console.log('system:', callbackId, command, params)
      let response: any = {}
      switch (command) {
        case "mem": {
          response = await mem();
        }
        break;
        case "cpu": {
          response = await cpu();
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
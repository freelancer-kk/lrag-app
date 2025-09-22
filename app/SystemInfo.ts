import { ipcMain } from 'electron';
import { cpu, graphics, mem } from 'systeminformation';
import * as nodeDiskInfo from 'node-disk-info';
import { platform } from 'os';

const isMac: boolean = platform() === "darwin";
const isWindows: boolean = platform() === "win32";
const isLinux: boolean = platform() === "linux";

export default class SystemInfo {
  constructor() {}

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
          response = await graphics(); // 'basic' or 'complete'
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
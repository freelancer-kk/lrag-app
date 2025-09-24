import { Injectable } from '@angular/core';
import { ElectronService } from '../electron/electron.service';
import { isBreakStatement } from 'typescript';
import { SystemService } from '../system/system.service';

@Injectable({
  providedIn: 'root'
})
export class BridgeService {
  isElectronRendered: boolean = false;
  callbacks: any[] = [];
  matchCallbacks: any[] = [];
  cb: (ev: any, result: any) => void = () => {};
  chatcb: (ev: any, result: any) => void = () => {};
  
  constructor(
    private electronService: ElectronService,    
  ) {
    this.isElectronRendered = (this.electronService.ipcRenderer != undefined);
  }

  registerListener = () => {
    if (this.isElectronRendered) {
      this.electronService.ipcRenderer.on('reply', (_event: any, result: any) => {
        const { callbackId, response } = result;
        const cbIdx: number = this.callbacks.findIndex(f => f.callbackId === callbackId);
        if (cbIdx > -1) {
          const cb: (response: any) => void = this.callbacks[cbIdx].cb;
          // console.log('bridge: found callback:', cb);          
          this.callbacks.splice(cbIdx, 1);
          // console.log('bridge: calling callback for id:', callbackId, response);
          cb(JSON.parse(response ? response : '{}'));
        } else {
          console.error('bridge:reply cannot find callbackId:', callbackId);
        }
      })
      this.electronService.ipcRenderer.on('message', (_event: any, result: any) => {
        const { callbackId, response } = result;
        const cbIdx: number = this.matchCallbacks.findIndex(f => f.callbackId === callbackId);
        if (cbIdx > -1) {
          const cb: (response: any) => boolean = this.matchCallbacks[cbIdx].cb;
          // console.log('bridge: found callback:', cb);          
          if (cb(JSON.parse(response))) {
            this.matchCallbacks.splice(cbIdx, 1);
          }
        } else {
          console.error('bridge:message cannot find callbackId:', callbackId);
        }
      }) 
      this.electronService.ipcRenderer.on('event', (_event: any, result: any) => {
        // console.log('bridge:event', result.response);
        this.cb(_event, result.response);        
      }) 
      this.electronService.ipcRenderer.on('chat', (_event: any, result: any) => {
        // console.log('chat:event', result.response);
        this.chatcb(_event, result.response);        
      }) 
    }
  }

  eventCallback = (cb: (ev: any, result: any) => void) => {
    this.cb = cb;
  }

  chatCallback = (cb: (ev: any, result: any) => void) => {
    this.chatcb = cb;
  }

  callNode = (
    category: string,
    callbackId: number,
    cb: (response: any) => void,
    command: string,
    params: any = {},
    cb1: ((response: any) => boolean) | undefined
  ) => {
    this.callbacks.push({
      callbackId,
      cb
    });
    if (cb1) {
      this.matchCallbacks.push({
        callbackId,
        cb1
      })
    }
    this.electronService.ipcRenderer.send(
      category,
      {
        callbackId,
        command,
        params
      });
  }

  getMem = (callbackId: number, cb: (response: any) => void) => {
    if (this.isElectronRendered) {
      this.callNode('system', callbackId, cb, 'mem', {}, undefined);
    } else {
      cb({
          "total": 66887396,
          "free": 38145376,
          "swapTotal": 83140324,
          "swapFree": 39971860
      })
    }
  }

  getGpu = (callbackId: number, cb: (response: any) => void) => {
    if (this.isElectronRendered) {
      this.callNode('system', callbackId, cb, 'gpu', {}, undefined);
    } else {
      cb({
          "controllers": [
              {
                  "vendor": "Meta Inc.",
                  "model": "Meta Virtual Monitor",
                  "bus": "",
                  "vram": 0,
                  "vramDynamic": true,
                  "subDeviceId": null
              },
              {
                  "vendor": "NVIDIA",
                  "model": "NVIDIA GeForce RTX 4080 SUPER",
                  "bus": "PCI",
                  "vram": 16376,
                  "vramDynamic": true,
                  "subDeviceId": "89621043"
              },
              {
                  "vendor": "Intel Corporation",
                  "model": "Intel(R) UHD Graphics 770",
                  "bus": "PCI",
                  "vram": 2047.99609375,
                  "vramDynamic": true,
                  "subDeviceId": "7D301462"
              }
          ],
          "displays": [
              {
                  "vendor": "",
                  "model": "Default Monitor",
                  "deviceName": "\\\\.\\DISPLAY1",
                  "main": true,
                  "builtin": false,
                  "connection": "DP",
                  "resolutionX": 5120,
                  "resolutionY": 1440,
                  "sizeX": 119,
                  "sizeY": 34,
                  "pixelDepth": 32,
                  "currentResX": 4096,
                  "currentResY": 1152,
                  "positionX": 0,
                  "positionY": 0,
                  "currentRefreshRate": 239
              }
          ]
      })
    }
  }  

  getCpu = (callbackId: number, cb: (response: any) => void) => {
    if (this.isElectronRendered) {
      this.callNode('system', callbackId, cb, 'cpu', {}, undefined);
    } else {
      cb({
          "manufacturer": "Intel",
          "brand": "Gen Intel® Core™ i9-13900KS",
          "vendor": "GenuineIntel",
          "family": "6",
          "model": "183",
          "stepping": "1",
          "revision": "",
          "voltage": "",
          "speed": 3.2,
          "speedMin": 3.2,
          "speedMax": 3.2,
          "governor": "",
          "cores": 32,
          "physicalCores": 24,
          "performanceCores": 32,
          "efficiencyCores": 0,
          "processors": 1,
          "socket": "LGA1700",
          "flags": "de pse mce sep mtrr mca cmov psn clfsh ds mmx fxsr sse sse2 ss htt tm ia64 pbe",
          "virtualization": true,
          "cache": {
              "l1d": 917504,
              "l1i": 1310720,
              "l2": 33554432,
              "l3": 37748736
          }
      })
    }
  }

  getDisks = (callbackId: number, cb: (response: any) => void) => {
    if (this.isElectronRendered) {
      this.callNode('system', callbackId, cb, 'disks', {}, undefined);
    } else {
      cb([{
        _blocks: 119387713536,
        _used: 109906608128,
        _available: 9481105408,
        _capacity: "92%",
        _mounted: "C:"
      }])
    }
  }
  
  getOSType = (callbackId: number, cb: (response: any) => void) => {
    if (this.isElectronRendered) {
      this.callNode('system', callbackId, cb, 'os', {}, undefined);
    } else {
      cb({
          "isMac": false,
          "isWindows": true,
          "isLinux": false          
      })
    }
  }

  env = (callbackId: number, command: string, options: any, cb: (response: any) => void) => {
    if (this.isElectronRendered) {
      this.callNode('env', callbackId, cb, command, options, undefined);
    } else {
      cb({
          "started": "ok"
      })
    }
  }

  lragfiles = (callbackId: number, command: string, options: any, cb: (response: any) => void) => {
    if (this.isElectronRendered) {
      this.callNode('lragfiles', callbackId, cb, command, options, undefined);
    } else {
      cb({
          "response": "ok"
      })
    }
  }

  ollama = (callbackId: number, command: string, options: any, cb: (response: any) => void) => {
    if (this.isElectronRendered) {
      this.callNode('ollama', callbackId, cb, command, options, undefined); 
    } else {
      cb({
          "response": "ok"
      })
    }
  }
  
  ingest = (callbackId: number, command: string, options: any, cb: (response: any) => void) => {
    if (this.isElectronRendered) {
      this.callNode('ingest', callbackId, cb, command, options, undefined); 
    } else {
      cb({
          "response": "ok"
      })
    }
  }

  chat = (callbackId: number, command: string, options: any, cb: (response: any) => void) => {
    if (this.isElectronRendered) {
      this.callNode('chat', callbackId, cb, command, options, undefined); 
    } else {
      cb({
          "response": "ok"
      })
    }
  }

  removeListeners = () => {
    if (this.isElectronRendered) {
      this.electronService.ipcRenderer.removeAllListeners('reply')
      this.electronService.ipcRenderer.removeAllListeners('message')
      this.electronService.ipcRenderer.removeAllListeners('event')
      this.electronService.ipcRenderer.removeAllListeners('chat')
    }
  }
}

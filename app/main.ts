import { app, BrowserWindow, nativeImage, screen, Tray } from 'electron';
import * as path from 'path';
import * as fs from 'fs';

import DockerEnv from './DockerEnv';
import SystemInfo, { isLinux, isMac, isWindows } from './SystemInfo';
import LRagFiles from './LragFiles';
import OllamaService from './OllamaService';
import LangchainService from './LangchainService';
import ContextChat from './ContextChat';
import { Systeminformation } from 'systeminformation';

const userHomePath: string = app.getPath('home');
const assetsPakFolderPath: string = app.getPath('assets');
const userDataPath: string = app.getPath('userData');
const resourcesPath: string = process.resourcesPath;
const appDataPath: string = app.getPath('appData');
const userTempPath: string = app.getPath('temp');
const separator: string = path.sep;

let win: BrowserWindow | null = null;
let assetsFolderPath: string = '';
let dockerEnv: DockerEnv;
let lragFiles: LRagFiles;
let ollamaService: OllamaService;
let langchainService: LangchainService;
let contextChat: ContextChat;
let systemInfo: SystemInfo;
let tray: Tray;
let favIconPath: string;
let favImage: Electron.NativeImage;

let configPath: string = path.join(__dirname, '..');

const args = process.argv.slice(1), serve = args.some(val => val === '--serve');

let runType = 0;
if (serve) {
  runType = 0;  
} else {
  if (fs.existsSync(path.join(__dirname, '../dist/index.html'))) {
    runType = 1;
    configPath = path.join(__dirname, '..');
  } else {
    runType = 2;  
    configPath = path.join(userDataPath, 'config')
  }
}
console.log('APP:RUN:MODE', runType);

const setDocPathsCB = async (docPath: string | undefined, dataPath: string | undefined) => {
  systemInfo = new SystemInfo();
  systemInfo.register();
  await systemInfo.getGraphics().then(async (graphics: Systeminformation.GraphicsData) => {
    console.log('graphics:', graphics.controllers.map(v => v.vendor));
    lragFiles = new LRagFiles(docPath, dataPath);
    lragFiles.register();
    langchainService = new LangchainService(docPath ? docPath : path.join(userDataPath, 'docs'), path.join(appDataPath, 'lrag-app', 'lrag'));
    langchainService.register(win?.webContents);
    ollamaService = new OllamaService(userTempPath, appDataPath, graphics.controllers.map(v => v.vendor));
    ollamaService.register(win?.webContents);
    await ollamaService.extract();
    contextChat = new ContextChat(langchainService, ollamaService);
    contextChat.register(win?.webContents);
    // langchainService.inspect();
  })  
}

const calcAssetsFolderPath = () => {
  let assetsPath: string = '../src/assets';
  if (serve) {
    assetsFolderPath = path.join(__dirname, assetsPath);
  } else if (fs.existsSync(path.join(__dirname, '../dist/index.html'))) {
    assetsPath = '../dist/assets';
    assetsFolderPath = path.join(__dirname, assetsPath);
  } else {
    assetsFolderPath = path.join(assetsPakFolderPath, 'resources', 'app.asar', 'assets')      
  }
}

function createWindow(): BrowserWindow {

  const size = screen.getPrimaryDisplay().workAreaSize;

  // Create the browser window.
  win = new BrowserWindow({
    x: 0,
    y: 0,
    width: size.width/2,
    height: size.height,
    minWidth: 400, // Optional: Set a minimum width
    minHeight: 300, // Optional: Set a minimum height
    resizable: true,
    icon: favImage,
    autoHideMenuBar: runType === 2,
    webPreferences: {
      nodeIntegration: true,
      allowRunningInsecureContent: serve,
      contextIsolation: false,
      webSecurity: !serve,
//      devTools: runType === 2
    },
  });
  
  if (serve) {
    import('electron-debug').then(debug => {
      debug.default({isEnabled: true, showDevTools: true});
    });

    import('electron-reloader').then(reloader => {
      const reloaderFn = (reloader as any).default || reloader;
      reloaderFn(module);
    });
    win.loadURL('http://localhost:4200');    
    dockerEnv = new DockerEnv(configPath, assetsFolderPath, userHomePath, userDataPath, userTempPath, separator, setDocPathsCB);
  } else {
    
    // Path when running electron executable
    let pathIndex: string = './index.html';
    
    if (fs.existsSync(path.join(__dirname, '../dist/index.html'))) {
       // Path when running electron in local folder
      pathIndex = '../dist/index.html';  
      
    }
    dockerEnv = new DockerEnv(configPath, assetsFolderPath, userHomePath, userDataPath, userTempPath, separator, setDocPathsCB);

    const fullPath = path.join(__dirname, pathIndex);
    const url = `file://${path.resolve(fullPath).replace(/\\/g, '/')}`;
    win.loadURL(url);    
  }
  
  // Emitted when the window is closed.
  win.on('closed', () => {
    // Dereference the window object, usually you would store window
    // in an array if your app supports multi windows, this is the time
    // when you should delete the corresponding element.
    console.log('Electron on closed')
    win = null;    
  });

  return win;
}

try {
  // This method will be called when Electron has finished
  // initialization and is ready to create browser windows.
  // Some APIs can only be used after this event occurs.
  // Added 400 ms to fix the black background issue while using transparent window. More detais at https://github.com/electron/electron/issues/15947
  app.on('ready', () => {            
    setTimeout(() => {
      calcAssetsFolderPath();

      if (isLinux) {
        favIconPath = path.join(assetsFolderPath, 'icons', 'favicon.png');
        tray = new Tray(favIconPath);
      } else if (isMac) {
        favIconPath = path.join(assetsFolderPath, 'icons', 'favicon.png');
        favImage = nativeImage.createFromPath(favIconPath)
        favImage = favImage.resize({
          height: 16,
          width: 16
        })      
        tray = new Tray(favImage);      
      } else {
        favIconPath = path.join(assetsFolderPath, 'icons', 'favicon.ico');
        favImage = nativeImage.createFromPath(favIconPath)
        tray = new Tray(favImage);
      }
      
      tray.setToolTip('LRag - Local Document AI Insights!');    
      createWindow();      
      dockerEnv.register();        
    }, 400)    
  });  

  app.on("before-quit", (e) => {
    console.log("before-quit: abort any transactions ollama may be doing");
    ollamaService.abort();
    ollamaService.stop();
  });

  /*
  process.on("SIGINT", () => {
    console.log("Detected SIGINT/SIGTERM");
    if (ollamaService) {
      ollamaService.stop();
    }
    app.quit();
  });
  */

  // Quit when all windows are closed.
  app.on('window-all-closed', () => {
    // On OS X it is common for applications and their menu bar
    // to stay active until the user quits explicitly with Cmd + Q
    if (process.platform !== 'darwin') {
      console.log('Electron on window-all-closed')
      app.quit();
    }
  });

  app.on('activate', () => {
    // On OS X it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (win === null) {
      createWindow();
    }
  });  

} catch (e) {
  // Catch Error
  // throw e;
}

import { app, BrowserWindow, nativeImage, screen, Tray } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import log from 'electron-log/main';

import DockerEnv from './DockerEnv';
import SystemInfo, { isLinux, isMac, isWindows } from './SystemInfo';
import LRagFiles from './LragFiles';
import OllamaService from './OllamaService';
import LangchainService from './LangchainService';
import ContextChat from './ContextChat';
import { Systeminformation } from 'systeminformation';
import AppUpdates from './AppUpdates';
import ReRankerService from './RerankerService';
import OCRProcessor from './OCRProcessor';
import WatcherService from './WatcherService';
import LicenseService from './LicenseService';
import OCRllmProcessor from './OCRllmProcessor';
import { to } from 'mathjs';

const userHomePath: string = app.getPath('home');
// const assetsPakFolderPath: string = app.getPath('assets');
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
let rerankerService: ReRankerService;
let langchainService: LangchainService;
let contextChat: ContextChat;
let systemInfo: SystemInfo;
let tray: Tray;
let favIconPath: string;
let favImage: Electron.NativeImage;
let appUpdates: AppUpdates;
let watcherService: WatcherService;
let ocrProcessor: OCRProcessor;
let ocrLlmProcessor: OCRllmProcessor;
let licenseService: LicenseService;
let useWatcher: boolean = false;

log.initialize();

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
log.info('APP:RUN:MODE', runType);

const setDocPathsCB = async (licenseKey: string | undefined, docPath: string | undefined, dataPath: string | undefined) => {
  let toolsDLS: any;
  const tools_dls_file: string | undefined = await dockerEnv.getKeyValue('TOOLS_DLS_FILE');
  if (tools_dls_file) {
    toolsDLS = await (await fetch(
      tools_dls_file,
      {
        method: 'GET',          
      }
    )).json();
  }
  systemInfo = new SystemInfo(toolsDLS);
  systemInfo.register(win?.webContents);
  const totalMemory: number = Math.ceil(await systemInfo.getTotalMemory()/1024/1024/1024)
  log.info('System Total Memory:', totalMemory);
  if (totalMemory < 12) {
    useWatcher = true;
  } else {
    useWatcher = await dockerEnv.getKeyValue('USE_WATCHER')?.toLowerCase() === 'true' ? true : false;
  }
  log.info('Use Watcher Service:', useWatcher);
  
  licenseService = new LicenseService(systemInfo.id, licenseKey, await dockerEnv.getKeyValue('LICENSE_GET_URL'), await dockerEnv.getKeyValue('LICENSE_ACTIVATE_URL'));
  licenseService.register(win?.webContents);
  await licenseService.validate();  
  await systemInfo.getGraphics().then(async (graphics: Systeminformation.GraphicsData) => {
    log.info('graphics:', graphics.controllers.map(v => v.vendor));
    lragFiles = new LRagFiles(docPath, dataPath);
    lragFiles.register();

    const gpuAccelerationStr: string | undefined = await dockerEnv.getKeyValue('GPU_ACCELERATION');
    const gpuAcceleration: boolean = gpuAccelerationStr && gpuAccelerationStr.toLowerCase() === "true" ? true : false;
    const ollama_version: string | undefined = await dockerEnv.getKeyValue('OLLAMA_VERSION');
    const ipex_version: string | undefined = await dockerEnv.getKeyValue('IPEX_VERSION');
    const reranker_version: string | undefined = await dockerEnv.getKeyValue('RERANKER_VERSION');
    
    if (useWatcher) {
      const ghostscript_version: string | undefined = await dockerEnv.getKeyValue('GHOSTSCRIPT_VERSION');
      const watcher_version: string | undefined = await dockerEnv.getKeyValue('WATCHER_VERSION');
      
      const watcher_win_dl = toolsDLS.WATCHER_WIN_DOWNLOAD_LINK;
      const watcher_mac_dl = toolsDLS.WATCHER_MAC_DOWNLOAD_LINK;
      
      if (ghostscript_version && watcher_version && watcher_win_dl && watcher_mac_dl) {
        log.info('Initialising watcher service:', watcher_version, toolsDLS.WATCHER_VERSION, watcher_win_dl, watcher_mac_dl);
        watcherService = new WatcherService(
          watcher_version,
          toolsDLS.WATCHER_VERSION,
          watcher_mac_dl,
          watcher_win_dl,
          ghostscript_version,
          toolsDLS.GHOSTSCRIPT_WIN_DOWNLOAD_LINK,
          toolsDLS.HOMEBREW_MAC_DOWNLOAD_LINK,         
          toolsDLS.HOMEBREW_MAC_VERSION,
          toolsDLS.GHOSTSCRIPT_MAC_DOWNLOAD_LINK,
          toolsDLS.TESSERACT_WIN_VERSION,
          toolsDLS.TESSERACT_WIN_DOWNLOAD_LINK,
          path.join(userDataPath, 'watcher'),
          userTempPath,
          appDataPath,
          async () => {
            await dockerEnv.kvFile?.set('WATCHER_VERSION', toolsDLS.WATCHER_VERSION);
            await dockerEnv.kvFile?.writeFile();
          }
        )
        watcherService.register(win?.webContents);
        await watcherService.install();
      } else {
        log.info('Ignoring WATCHER service:', watcher_version, watcher_win_dl, watcher_mac_dl);
      }
      ocrProcessor = new OCRProcessor(watcherService, dockerEnv);
      await ocrProcessor.start();
    }
    
    const darwin_dl = toolsDLS.DARWIN_DOWNLOAD_LINK;
    const ipex_dl = toolsDLS.IPEX_DOWNLOAD_LINK;
    const rocm_dl = toolsDLS.ROCM_DOWNLOAD_LINK;
    const default_dl = toolsDLS.DEFAULT_DOWNLOAD_LINK;

    const ollama_api_key: string | undefined = await dockerEnv.getKeyValue('OLLAMA_API_KEY');

    if (darwin_dl && ipex_dl && rocm_dl && default_dl) {
      ollamaService = new OllamaService(
        ollama_api_key,
        ollama_version ? ollama_version : '',
        toolsDLS.OLLAMA_VERSION,
        ipex_version ? ipex_version : '',
        toolsDLS.IPEX_VERSION,
        darwin_dl,
        ipex_dl,
        rocm_dl,
        default_dl,
        userTempPath,
        appDataPath,
        graphics.controllers.map(v => v.vendor),
        gpuAcceleration,
        async () => {
          await dockerEnv.kvFile?.set('OLLAMA_VERSION', toolsDLS.OLLAMA_VERSION);
          await dockerEnv.kvFile?.set('IPEX_VERSION', toolsDLS.IPEX_VERSION);    
          await dockerEnv.kvFile?.writeFile(); 
        }
      );
      ollamaService.register(win?.webContents);
      const managed_externally: string | undefined = dockerEnv.getKeyValue('MANAGE_EXTERNAL');
      if ((isWindows === true || isLinux === true) && (managed_externally?.toLowerCase() === 'false')) {
        await ollamaService.install();
      }      
    }

    ocrLlmProcessor = new OCRllmProcessor(ollamaService, userTempPath);
    await ocrLlmProcessor.start();
    langchainService = new LangchainService(
      docPath ? docPath : path.join(userDataPath, 'docs'),
      path.join(appDataPath, 'lrag-app', 'lrag'),
      useWatcher ? ocrProcessor : undefined,
      ocrLlmProcessor
    );
    langchainService.register(win?.webContents);
  
    const reranker_win_dl = toolsDLS.RERANKER_WIN_DOWNLOAD_LINK;
    const reranker_mac_dl = toolsDLS.RERANKER_MAC_DOWNLOAD_LINK;
    if (reranker_version && reranker_win_dl && reranker_mac_dl) {
      log.info('Initialising reranker service:', reranker_version, toolsDLS.RERANKER_VERSION, reranker_win_dl, reranker_mac_dl);
      rerankerService = new ReRankerService(
        reranker_version,
        toolsDLS.RERANKER_VERSION,
        reranker_mac_dl,
        reranker_win_dl,
        userTempPath,
        appDataPath,
        path.join(userDataPath, 'reranker'),          
        async () => {
          await dockerEnv.kvFile?.set('RERANKER_VERSION', toolsDLS.RERANKER_VERSION);
          await dockerEnv.kvFile?.writeFile();
        }
      )
      rerankerService.register(win?.webContents);
      await rerankerService.install();
    } else {
      log.info('Ignoring RERANKER service:', reranker_version, reranker_win_dl, reranker_mac_dl);
    }
    
    contextChat = new ContextChat(langchainService, ollamaService, rerankerService, dockerEnv);
    contextChat.register(win?.webContents);
    // langchainService.inspect();

    appUpdates = new AppUpdates(dockerEnv.getKeyValue('UPDATE_INFO_FILE'));
    await appUpdates.init();    
  }); 
}

const calcAssetsFolderPath = () => {
  let assetsPath: string = '../src/assets';
  if (serve) {
    assetsFolderPath = path.join(__dirname, assetsPath);
  } else if (fs.existsSync(path.join(__dirname, '../dist/index.html'))) {
    assetsPath = '../dist/assets';
    assetsFolderPath = path.join(__dirname, assetsPath);
  } else {
    // assetsFolderPath = path.join(assetsPakFolderPath, 'resources', 'app.asar', 'assets')      
    assetsFolderPath = path.join(resourcesPath, 'app.asar', 'assets')      
  }
}

async function createWindow(): Promise<BrowserWindow> {

  const size = screen.getPrimaryDisplay().workAreaSize;

  // Create the browser window.
  win = new BrowserWindow({
    x: 0,
    y: 0,
    show: false,
    width: runType === 2 ? size.width/2 : size.width/2.1,
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
// Uncomment the next line to disable dev tools in production      
      devTools: runType !== 2
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
    dockerEnv = new DockerEnv(configPath, assetsFolderPath, userHomePath, userDataPath, userTempPath, separator, setDocPathsCB);
    await dockerEnv.init();
    dockerEnv.register();

    win.loadURL('http://localhost:4200');     
  } else {
    
    // Path when running electron executable
    let pathIndex: string = './index.html';
    
    if (fs.existsSync(path.join(__dirname, '../dist/index.html'))) {
       // Path when running electron in local folder
      pathIndex = '../dist/index.html';  
      
    }
    dockerEnv = new DockerEnv(configPath, assetsFolderPath, userHomePath, userDataPath, userTempPath, separator, setDocPathsCB);
    await dockerEnv.init();
    dockerEnv.register();

    const fullPath = path.join(__dirname, pathIndex);
    const url = `file://${path.resolve(fullPath).replace(/\\/g, '/')}`;
    win.loadURL(url);    
  }
  
  // Emitted when the window is closed.
  win.on('closed', () => {
    // Dereference the window object, usually you would store window
    // in an array if your app supports multi windows, this is the time
    // when you should delete the corresponding element.
    log.info('Electron on closed')
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
    setTimeout(async () => {
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
      const browserWin = await createWindow();
      browserWin.once("ready-to-show", () => {
        log.info('main:ready-to-show');
        log.info('main:starting services if already installed:');      
        ollamaService.startIfInstalled();
        rerankerService.startIfInstalled();
        if (useWatcher) { watcherService.startIfInstalled(); }
        browserWin.show();
      })      
    }, 400)    
  }); 

  app.on("before-quit", async (e) => {
    log.info("before-quit: abort any transactions ollama may be doing");
    ollamaService.abort();
    await ollamaService.stop();
    await rerankerService.stop();
    if (useWatcher) { await watcherService.stop(); }
  });

  /*
  process.on("SIGINT", () => {
    log.info("Detected SIGINT/SIGTERM");
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
      log.info('Electron on window-all-closed')
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

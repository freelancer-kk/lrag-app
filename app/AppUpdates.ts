import { app, dialog, shell } from 'electron';
import log from 'electron-log/main';

export default class AppUpdates {
  updateJsonFileURL: string = '';
  askForDownloads: string[] = [];
  
  constructor(updateJsonFileURL: string | undefined) {
    if (updateJsonFileURL) {
      this.updateJsonFileURL = updateJsonFileURL;
    }
  }

  init = async () => {
    log.info('AppUpdates:changes in:', this.updateJsonFileURL);
    setInterval(async () => {              
      await this.check();
    }, 60000);    
  }

  check = async () => {
    try {
      const updateData: any = await (await fetch(
        this.updateJsonFileURL,
        {
          method: 'GET',          
        }
      )).json();

      const entries: any[] = updateData[process.platform];
      const currentVersion: string = app.getVersion().replace(/\./g,'');
      let upgrade: any | undefined = undefined;
      for await (const entry of entries) {
        const version = entry.version.replace(/\./g,'');
        // log.info('comparing:', version, '-', currentVersion);
        if (Number(version) > Number(currentVersion)) {
          upgrade = {
            version: entry.version,
            comment: entry.comment,
            url: entry.url
          }
        }
      }
      if (upgrade) {
        if (!this.askForDownloads.includes(upgrade.version)) {
          this.askForDownloads.push(upgrade.version);
          log.info('found new version:', upgrade.version);
          this.askUpgrade(upgrade.version, upgrade.comment, upgrade.url);
        }
      }
    } catch (e) {
      log.info('AppUpdates:check:error');
      log.error(e);      
    }
  }
        
  askUpgrade = (version: string, comment: string, url: string) => {
    const dialogOpts: any = {
      type: 'info',
      buttons: ['Quit & Download Now', 'Later'],
      title: 'LRag Application',
      message: comment,
      detail:
        'A new version ' + version + ' is available for download. Would you like to QUIT the application and download now?'
    }
    
    dialog.showMessageBox(dialogOpts).then(async (returnValue) => {
      if (returnValue.response === 0) {
        await shell.openExternal(url);
        app.quit();
        // Quit and install
        // autoUpdater.quitAndInstall()
      }
    })   
  }
}
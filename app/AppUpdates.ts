import { app, dialog, shell } from 'electron';

export default class AppUpdates {
  updateJsonFileURL: string = '';
  askForDownloads: string[] = [];
  
  constructor(updateJsonFileURL: string | undefined) {
    if (updateJsonFileURL) {
      this.updateJsonFileURL = updateJsonFileURL;
    }
  }

  init = async () => {
    console.log('AppUpdates:changes in:', this.updateJsonFileURL);
    setInterval(async () => {              
      await this.check();
    }, 60000);
    // await this.check();
  }

  check = async () => {
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
      console.log('comparing:', version, '-', currentVersion);
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
        console.log('found new version:', upgrade.version);
        this.askUpgrade(upgrade.version, upgrade.comment, upgrade.url);
      }
    }
  }
        
  askUpgrade = (version: string, comment: string, url: string) => {
    const dialogOpts: any = {
      type: 'info',
      buttons: ['Download Now', 'Later'],
      title: 'LRag Application',
      message: comment,
      detail:
        'A new version ' + version + ' is available for download. Would you like to download now?'
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
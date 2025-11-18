import { ipcMain } from 'electron';
import log from 'electron-log/main';

export enum ELicenseStatus {
  ENTERING = 0,
  ENTERED,
  ACTIVATED,
  REVOKED,
  EXPIRED,
  NOT_ACTIVATED
}

export enum ELicenseType {
  FREE = 0,
  PRO = 1,
  PROPLUS = 2
}

export interface ILicenseDetails {
  success: boolean;
  license: {
    id: number;
    user_id: number;
    email: string;
    license_key: string;
    product_type: string;
    duration_months: number;
    stripe_payment_id: string;
    status: string;
    created_at: number;
    expires_at: number;
    last_checked: number;
    activations: number;
    machine_ids: string[];
  }
}

export default class LicenseService {
  webContents: Electron.WebContents | undefined;
  machineId: string;
  licenseKey: string | undefined;
  licenseGetURL: string | undefined;
  licenseActiveURL: string | undefined;
  licenseType: ELicenseType = ELicenseType.FREE;
  licenseStatus: ELicenseStatus = ELicenseStatus.ACTIVATED;
  licenseChecked: boolean = false;
  licenseDetails: ILicenseDetails | undefined;

  constructor(machineId: string, licenseKey: string | undefined, licenseGetURL: string | undefined, licenseActivateURL: string | undefined) {
    this.machineId = machineId;
    this.licenseKey = licenseKey;
    this.licenseGetURL = licenseGetURL;
    this.licenseActiveURL = licenseActivateURL;
  }

  activate = async (licenseKey: string): Promise<any> => {
    if (this.licenseActiveURL) {
      const body: any = {
        "license-key": licenseKey,
        "machine-id": this.machineId,
      }

      try {
        const licenseResponse: any = await (await fetch(
          this.licenseActiveURL,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(body)
          }
        )).json();
        log.info('LicenseService:activate:', licenseResponse);        
        return licenseResponse;        
      } catch (le) {
        log.error(le);       
      }
    } else {
      return {
        success: false,
        error: 'No activation url available!'
      }
    }
  }

  validate = async () => {
    if (this.licenseKey && this.licenseKey !== '' && this.licenseKey.length === 19 && this.licenseGetURL) {
      // Check the license against the service

      const body: any = {
        "license-key": this.licenseKey,
      }

      try {
        const licenseResponse: any = await (await fetch(
          this.licenseGetURL,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(body)
          }
        )).json();
        log.info('LicenseService:validate:', licenseResponse);
        if (licenseResponse.success === true) {
          this.licenseDetails = licenseResponse;
          this.licenseType = this.licenseDetails?.license.product_type === 'standard' ? ELicenseType.PRO : ELicenseType.FREE;
          this.licenseStatus = this.licenseDetails?.license.status === 'active' ? ELicenseStatus.ACTIVATED :
              this.licenseDetails?.license.status === 'revoked' ? ELicenseStatus.REVOKED :
              ELicenseStatus.EXPIRED;

          this.licenseStatus = this.licenseDetails?.license.machine_ids.includes(this.machineId) ? ELicenseStatus.ACTIVATED : ELicenseStatus.NOT_ACTIVATED;
          this.licenseChecked = true;
        }
      } catch (le) {
        log.error(le);       
      }
    }
  }

  emit = (args: any) => {
    this.webContents?.send('license-event', {
      response: args
    })                
  }

  register = (webContents: Electron.WebContents | undefined) => {
    this.webContents = webContents;
    ipcMain.on('license', async (event: any, arg: any) => {
      const { callbackId, command, params }= arg;
      log.info('LicenseService:', callbackId, command, params);

      let response: any = {}
      switch (command) {
        case "get": {
          response = {
            machineId: this.machineId,
            licenseKey: this.licenseKey,
            licenseType: this.licenseType,
            licenseChecked: this.licenseChecked,
            licenseStatus: this.licenseStatus,
            licenseDetails: this.licenseDetails ? this.licenseDetails : {
              success: false,
              license: {
                id: -1,
                user_id: -1,
                email: '',
                license_key: '????-????-????-????',
                product_type: 'free',
                duration_months: -1,
                stripe_payment_id: '?',
                status: 'active',
                created_at: Date.now(),
                expires_at: Date.now(),
                last_checked: Date.now(),
                activations: 0,
                machine_ids: ['?']
              }
            }
          }
          break;          
        }
        case "activate": {
          response = await this.activate(params.licenseKey);
        }
      }
      event.reply('reply', {
        callbackId,
        response: JSON.stringify(response)
      })
    });
  }
}
import { Injectable } from '@angular/core';
import { ISettings } from '../../shared/model';

@Injectable({
  providedIn: 'root'
})
export class SettingsService {
  licSettings: ISettings;
  licenseDetails: any = {
    duration: 'indefinite'
  };

  constructor() {
    this.licSettings = {
      licenseKey: 'FREE-XXXX-XXX-XXX-XXX',
      licenseHolderName: 'Anyone'      
    }
  }

  getLicenseDetails = () => {
    // TODO: Contact license server and obtain details
    // Save to local storage for offline access
  }  
}

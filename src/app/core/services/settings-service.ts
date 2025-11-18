import { Injectable } from '@angular/core';
import { ELicenseStatus, ELicenseType, ILicense } from '../../shared/model';
import { CommonService } from './common-service';
import { BridgeService } from './bridge/bridge.service';

@Injectable({
  providedIn: 'root'
})
export class SettingsService {  
  license: ILicense;  

  constructor(
    private bridgeService: BridgeService,
    private commonService: CommonService
  ) {
    this.license = {
      machineId: '?',
      licenseKey: '????-????-????-????',
      licenseType: ELicenseType.FREE,
      licenseChecked: false,
      licenseStatus: ELicenseStatus.ACTIVATED,
      licenseDetails: {
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
    this.bridgeService.licCallback(this.licenseCallback);
  }

  licenseCallback = (ev: any, result: any) => {
    console.log('licenseCallback:', result);
  }

  getLicense = (): Promise<any> => {
    return this.commonService.licenseService(
      35634,
      'get'
    ).then((gLicense: ILicense) => {
      // console.log('getLicense:', gLicense);
      this.license = gLicense;
    })
  }  

  activateLicense = (licenseKey: string): Promise<any> => {
    return this.commonService.licenseService(
      35635,
      'activate',
      {
        licenseKey
      }
    );
  }  
}

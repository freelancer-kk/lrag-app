import { Component, OnInit, inject } from '@angular/core';
import {MatSnackBar} from '@angular/material/snack-bar';
import { SettingsService } from '../core/services/settings-service';
import { TranslateModule } from '@ngx-translate/core';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatTooltipModule } from '@angular/material/tooltip';
import { JsonViewModule } from 'nxt-json-view';
import { ELicenseStatus, ELicenseType } from '../shared/model';
import { FormsModule } from '@angular/forms';
import { MatInputModule } from '@angular/material/input';
import { CommonService } from '../core/services/common-service';
import { AlertComponent } from '../alert.component/alert.component';
import { MatDialog } from '@angular/material/dialog';

@Component({
  selector: 'app-settings.component',
  imports: [
    TranslateModule,
    MatCardModule,
    MatButtonModule,
    MatToolbarModule,
    MatProgressSpinnerModule,
    MatExpansionModule,
    MatTooltipModule,
    JsonViewModule,
    FormsModule,
    MatInputModule,
    MatProgressSpinnerModule
  ],
  templateUrl: './settings.component.html',
  styleUrl: './settings.component.scss'
})
export class SettingsComponent implements OnInit {
  readonly dialog = inject(MatDialog);
  private _snackBar = inject(MatSnackBar);

  public ELT = ELicenseType;
  public ELS = ELicenseStatus;
  activating = false;

  constructor(
    public settingsService: SettingsService,
    private commonService: CommonService
  ) {}

  ngOnInit(): void {}

  upgradePro = async (ev: any, months: number) => {
    console.log('upgradePro:', months);
    await this.commonService.openExternal(
      'TOOL',
      {
        var: "PAYMENT_LINK_" +  months
      }
    )
  }

  activatePro = async (ev: any) => {
    this.activating = true;
    try {
      const response: any = await this.settingsService.activateLicense(this.settingsService.license.licenseKey);
      console.log('activation:response:', response);
      if (response.success === true) {
        await this.commonService.setEnvValue('LICENSE_KEY', this.settingsService.license.licenseKey);
        const dialogRef = this.dialog.open(
          AlertComponent, {
            data: {
              type: 2,
              params: {
                message: await this.commonService.get('APP.EXIT_AFTER_ACTIVATION')
              }
            }
          });
        dialogRef.afterClosed().subscribe(async (result) => {
          console.log(`Dialog result: ${result}`);              
          await this.commonService.quitApp();              
        });        
      } else {
        this._snackBar.open(
          response.error,
          await this.commonService.get('OK'), {
            duration: 20000,
          }
        );
        await this.settingsService.getLicense();
      }
    } finally {      
      this.activating = false;
    }
  }
}

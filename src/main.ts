import { enableProdMode, inject, provideAppInitializer } from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';
import { importProvidersFrom } from '@angular/core';

import { AppComponent } from './app/app.component';
import { APP_CONFIG } from './environments/environment';
import { CoreModule } from './app/core/core.module';
import { SharedModule } from './app/shared/shared.module';
import { provideTranslateService, TranslateService } from '@ngx-translate/core';
import { provideTranslateHttpLoader } from '@ngx-translate/http-loader';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { routes } from './app/app.routes';
import { SystemService } from './app/core/services/system/system.service';
import { provideNgxSkeletonLoader } from 'ngx-skeleton-loader';

if (APP_CONFIG.production) {
  enableProdMode();
}

bootstrapApplication(AppComponent, {
  providers: [
    provideHttpClient(withInterceptorsFromDi()),    
    provideRouter(routes, withComponentInputBinding()),
    provideTranslateService({
      loader: provideTranslateHttpLoader({prefix:"assets/i18n/"}),
      fallbackLang: 'en',
      lang: TranslateService.getBrowserLang()
    }),
    importProvidersFrom(
      CoreModule,
      SharedModule
    ),
    provideAppInitializer(async () => {
      const initializerFn = async (systemService: SystemService) => {
        console.log('app initializer:start');
        const theme: string | null = localStorage.getItem('theme');        
        systemService.dark = theme ? JSON.parse(theme) : 'dark';        
        console.log('theme:', systemService.dark);
        const gpuAccelStr: string | null = localStorage.getItem('gpu-accel');
        systemService.gpuAcceleration= gpuAccelStr ? JSON.parse(gpuAccelStr) : 'true';        
        const manageOllamaExternally: string | null = localStorage.getItem('manage-ollama-externally');
        systemService.manageOllamaExternally = manageOllamaExternally ? JSON.parse(manageOllamaExternally) : 'false';
        console.log('managedExternally:', systemService.manageOllamaExternally);

        const chunkSettingsStr: string | null = localStorage.getItem('chunk-settings');
        systemService.chunkSize= chunkSettingsStr ? JSON.parse(chunkSettingsStr).chunkSize : 512;
        systemService.overlap= chunkSettingsStr ? JSON.parse(chunkSettingsStr).overlap : 48;

        const insightSettingsStr: string | null = localStorage.getItem('insight-settings');
        systemService.k = insightSettingsStr ? JSON.parse(insightSettingsStr).k : 4;
        systemService.filter = insightSettingsStr ? JSON.parse(insightSettingsStr).filter : undefined;
        systemService.numCtx = insightSettingsStr ? JSON.parse(insightSettingsStr).numCtx : undefined;
        systemService.mcpServices = insightSettingsStr ? JSON.parse(insightSettingsStr).mcpServices : undefined;
      };
      await initializerFn(inject(SystemService));
    }),
    provideNgxSkeletonLoader({
      theme: {
        extendsFromRoot: true,
        height: '30px',
      },
    }),
  ]
}).catch(err => console.error(err));

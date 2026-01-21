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
import { CommonService } from './app/core/services/common-service';
import { OllamaService } from './app/core/services/ollama-service';

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
      const initializerFn = async (systemService: SystemService, commonService: CommonService) => {
        console.log('app initializer:start');        
        await systemService.init();
        const theme: string | null = localStorage.getItem('theme');        
        systemService.dark = theme ? JSON.parse(theme) : 'dark';        
        console.log('theme:', systemService.dark);
      
        const chunkSettingsStr: string | null = localStorage.getItem('chunk-settings');
        console.log(chunkSettingsStr);
        systemService.chunkSize = chunkSettingsStr ? JSON.parse(chunkSettingsStr).chunkSize : 512;
        systemService.overlap = chunkSettingsStr ? JSON.parse(chunkSettingsStr).overlap : 48;
        systemService.useSemantic = chunkSettingsStr ? JSON.parse(chunkSettingsStr).useSemantic : false;
        if (systemService.useSemantic === undefined) {
          systemService.useSemantic = false;
        }
        systemService.localVector = false;        
        systemService.collection = chunkSettingsStr ? JSON.parse(chunkSettingsStr).collection : 'general';
        if (systemService.collection === undefined) {
          systemService.collection = "general";          
        }
        systemService.ocrPrompt = chunkSettingsStr ? JSON.parse(chunkSettingsStr).ocrPrompt : undefined;
        systemService.ocr_num_ctx = chunkSettingsStr ? JSON.parse(chunkSettingsStr).ocrNumCtx : undefined;

        const insightSettingsStr: string | null = localStorage.getItem('insight-settings');
        systemService.k = insightSettingsStr ? JSON.parse(insightSettingsStr).k : 4;
        // systemService.filter = insightSettingsStr ? JSON.parse(insightSettingsStr).filter : undefined;
        systemService.numCtx = insightSettingsStr ? JSON.parse(insightSettingsStr).numCtx : undefined;
        systemService.ragPrompt = insightSettingsStr ? JSON.parse(insightSettingsStr).ragPrompt : undefined;
        systemService.userPrompt = insightSettingsStr ? JSON.parse(insightSettingsStr).userPrompt : undefined;
        systemService.chatPrompt = insightSettingsStr ? JSON.parse(insightSettingsStr).chatPrompt : undefined;
        systemService.toolPrompt = insightSettingsStr ? JSON.parse(insightSettingsStr).toolPrompt : undefined;
        if (systemService.ragPrompt === undefined || systemService.ragPrompt === '') {
          systemService.ragPrompt = await commonService.get('PAGES.INSIGHT.CONTEXTUAL_PROMPT')
        }
        if (systemService.userPrompt === undefined || systemService.userPrompt === '') {
          systemService.userPrompt = await commonService.get('PAGES.INSIGHT.PROMPT')
        }
        if (systemService.chatPrompt === undefined) {
          systemService.chatPrompt = '{prompt}';
        }
        if (systemService.toolPrompt === undefined) {
          systemService.toolPrompt = '';
        }
        const historyStr: string | null  = localStorage.getItem('history');
        if (historyStr) {
          systemService.history = JSON.parse(historyStr);
        }
      };
      await initializerFn(inject(SystemService),inject(CommonService));
    }),
    provideNgxSkeletonLoader({
      theme: {
        extendsFromRoot: true,
        height: '30px',
      },
    }),
  ]
}).catch(err => console.error(err));

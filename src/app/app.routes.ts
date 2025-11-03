import { Routes } from '@angular/router';
import { PageNotFoundComponent } from '../app/shared/components';
import { HomeComponent } from '../app/home/home.component';

export const routes: Routes = [
  {
    path: '',
    redirectTo: 'home',
    pathMatch: 'full'
  },
  {
    path: 'home',
    component: HomeComponent
  },
  {
    path: 'detail',
    loadComponent: () => import('./detail/detail.component').then(m => m.DetailComponent)
  },
  {
    path: 'ingest',
    loadComponent: () => import('./ingest.component/ingest.component').then(m => m.IngestComponent)
  },
  {
    path: 'insights',
    loadComponent: () => import('./insights.component/insights.component').then(m => m.InsightsComponent)
  },
  {
    path: 'help',
    loadComponent: () => import('./help.component/help.component').then(m => m.HelpComponent)
  },
  {
    path: 'settings',
    loadComponent: () => import('./settings.component/settings.component').then(m => m.SettingsComponent)
  },
  
  {
    path: '**',
    component: PageNotFoundComponent
  }      
];

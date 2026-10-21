import { Routes } from '@angular/router';
import { HomeComponent } from './features/home/home.component';
import { loadRemoteModule } from '@angular-architects/native-federation';

export const routes: Routes = [
  {
    path: '',
    component: HomeComponent
  },
  {
    path: 'workflows',
    loadChildren: () =>
      loadRemoteModule('workflow-mfe', './WorkflowRoutes')
        .then((m) => m.WORKFLOW_ROUTES)
        .catch((err) => {
          console.warn('Failed to load Workflow MFE remote:', err);
          return import('./features/fallback/mfe-fallback.component').then(m => m.FALLBACK_WORKFLOW_ROUTES);
        })
  },
  {
    path: 'templates',
    loadChildren: () =>
      loadRemoteModule('template-mfe', './TemplateRoutes')
        .then((m) => m.TEMPLATE_ROUTES)
        .catch((err) => {
          console.warn('Failed to load Template MFE remote:', err);
          return import('./features/fallback/mfe-fallback.component').then(m => m.FALLBACK_TEMPLATE_ROUTES);
        })
  },
  {
    path: 'analytics',
    loadChildren: () =>
      loadRemoteModule('analytics-mfe', './AnalyticsRoutes')
        .then((m) => m.ANALYTICS_ROUTES)
        .catch((err) => {
          console.warn('Failed to load Analytics MFE remote:', err);
          return import('./features/fallback/mfe-fallback.component').then(m => m.FALLBACK_ANALYTICS_ROUTES);
        })
  },
  {
    path: '**',
    redirectTo: ''
  }
];

import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Routes } from '@angular/router';

@Component({
  selector: 'app-mfe-fallback',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './mfe-fallback.component.html',
  styleUrl: './mfe-fallback.component.css'
})
export class MfeFallbackComponent {
  @Input() remoteName = 'Micro-Frontend';
  @Input() expectedPort = '4201';
  @Input() exposedRoutes = './WorkflowRoutes';
}

export const FALLBACK_WORKFLOW_ROUTES: Routes = [
  {
    path: '',
    component: MfeFallbackComponent,
    data: { remoteName: 'Workflow Inbox', expectedPort: '4201', exposedRoutes: './WorkflowRoutes' }
  }
];

export const FALLBACK_TEMPLATE_ROUTES: Routes = [
  {
    path: '',
    component: MfeFallbackComponent,
    data: { remoteName: 'Template Studio', expectedPort: '4202', exposedRoutes: './TemplateRoutes' }
  }
];

export const FALLBACK_ANALYTICS_ROUTES: Routes = [
  {
    path: '',
    component: MfeFallbackComponent,
    data: { remoteName: 'Audit & Analytics', expectedPort: '4203', exposedRoutes: './AnalyticsRoutes' }
  }
];

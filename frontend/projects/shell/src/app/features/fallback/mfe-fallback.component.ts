import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Routes } from '@angular/router';

@Component({
  selector: 'app-mfe-fallback',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="bg-white rounded-xl border border-slate-200 p-8 text-center max-w-2xl mx-auto my-12 shadow-sm">
      <div class="w-12 h-12 bg-amber-100 text-amber-700 rounded-full flex items-center justify-center mx-auto text-xl font-bold">
        ⏳
      </div>
      <h2 class="text-xl font-bold text-slate-800 mt-4">{{ remoteName }} Remote Module</h2>
      <p class="text-sm text-slate-500 mt-2 leading-relaxed">
        This Micro-Frontend is registered under Native Federation at <code>{{ expectedPort }}</code>.
        It is either compiling or currently transitioning into Phase 2 development.
      </p>
      <div class="mt-6 p-4 bg-slate-50 rounded-lg text-xs font-mono text-left text-slate-600 border border-slate-200">
        <div><strong>Status:</strong> Native Federation Standby</div>
        <div><strong>Expected Entry:</strong> http://localhost:{{ expectedPort }}/remoteEntry.json</div>
        <div><strong>Exposed Contract:</strong> {{ exposedRoutes }}</div>
      </div>
    </div>
  `
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

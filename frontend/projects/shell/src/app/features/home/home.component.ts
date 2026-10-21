import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <div class="space-y-6">
      <!-- Welcome Hero Banner -->
      <div class="bg-gradient-to-r from-indigo-700 via-indigo-800 to-purple-800 rounded-2xl p-8 text-white shadow-lg">
        <div class="max-w-3xl">
          <h1 class="text-3xl font-extrabold tracking-tight sm:text-4xl">
            Enterprise Workflow Command Center
          </h1>
          <p class="mt-3 text-indigo-100 text-sm sm:text-base leading-relaxed">
            Welcome, <strong class="text-white underline">{{ auth.activePersona().name }}</strong> ({{ auth.activePersona().role }}).
            Your session is cryptographically secured with OAuth2/OIDC JWT verification at the API Gateway.
          </p>

          <div class="mt-6 flex flex-wrap gap-3">
            <a routerLink="/workflows"
               class="bg-white text-indigo-700 hover:bg-indigo-50 px-4 py-2 rounded-lg text-sm font-semibold shadow transition flex items-center space-x-2">
              <span>📋 Open Task Inbox</span>
            </a>
            <a routerLink="/templates"
               class="bg-indigo-600 bg-opacity-30 hover:bg-opacity-50 text-white border border-indigo-400 px-4 py-2 rounded-lg text-sm font-semibold transition flex items-center space-x-2">
              <span>📐 Template Studio</span>
            </a>
            <a routerLink="/analytics"
               class="bg-indigo-600 bg-opacity-30 hover:bg-opacity-50 text-white border border-indigo-400 px-4 py-2 rounded-lg text-sm font-semibold transition flex items-center space-x-2">
              <span>📊 CQRS Audit Analytics</span>
            </a>
          </div>
        </div>
      </div>

      <!-- Micro-Frontend System Status Cards -->
      <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
        <!-- Remote 1 -->
        <div class="bg-white p-6 rounded-xl border border-slate-200 shadow-sm hover:shadow transition">
          <div class="flex items-center justify-between">
            <span class="text-xs font-bold uppercase tracking-wider text-indigo-600 bg-indigo-50 px-2 py-1 rounded">
              Remote MFE #1
            </span>
            <span class="text-xs text-slate-400 font-mono">:4201</span>
          </div>
          <h3 class="text-base font-bold text-slate-900 mt-3">Workflow Inbox</h3>
          <p class="text-xs text-slate-500 mt-1">
            Persona-driven task inbox, dynamic JSON Schema form inputs, live SLA countdown timer, and state transitions.
          </p>
          <div class="mt-4 pt-4 border-t border-slate-100 flex items-center justify-between">
            <span class="text-[11px] text-slate-400">Status: Standalone / Federable</span>
            <a routerLink="/workflows" class="text-xs font-semibold text-indigo-600 hover:text-indigo-800">Launch &rarr;</a>
          </div>
        </div>

        <!-- Remote 2 -->
        <div class="bg-white p-6 rounded-xl border border-slate-200 shadow-sm hover:shadow transition">
          <div class="flex items-center justify-between">
            <span class="text-xs font-bold uppercase tracking-wider text-purple-600 bg-purple-50 px-2 py-1 rounded">
              Remote MFE #2
            </span>
            <span class="text-xs text-slate-400 font-mono">:4202</span>
          </div>
          <h3 class="text-base font-bold text-slate-900 mt-3">Template Studio</h3>
          <p class="text-xs text-slate-500 mt-1">
            Visual workflow step graph modeling, SLA policy assignments, role-based governance, and version publishing.
          </p>
          <div class="mt-4 pt-4 border-t border-slate-100 flex items-center justify-between">
            <span class="text-[11px] text-slate-400">Status: Standalone / Federable</span>
            <a routerLink="/templates" class="text-xs font-semibold text-purple-600 hover:text-purple-800">Launch &rarr;</a>
          </div>
        </div>

        <!-- Remote 3 -->
        <div class="bg-white p-6 rounded-xl border border-slate-200 shadow-sm hover:shadow transition">
          <div class="flex items-center justify-between">
            <span class="text-xs font-bold uppercase tracking-wider text-emerald-600 bg-emerald-50 px-2 py-1 rounded">
              Remote MFE #3
            </span>
            <span class="text-xs text-slate-400 font-mono">:4203</span>
          </div>
          <h3 class="text-base font-bold text-slate-900 mt-3">Audit & Analytics</h3>
          <p class="text-xs text-slate-500 mt-1">
            CQRS MongoDB event projection timeline, full actor audit trail, Kafka replay inspector, and SLA breach statistics.
          </p>
          <div class="mt-4 pt-4 border-t border-slate-100 flex items-center justify-between">
            <span class="text-[11px] text-slate-400">Status: Standalone / Federable</span>
            <a routerLink="/analytics" class="text-xs font-semibold text-emerald-600 hover:text-emerald-800">Launch &rarr;</a>
          </div>
        </div>
      </div>

      <!-- Active JWT Claims Card -->
      <div class="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
        <h3 class="text-sm font-bold text-slate-900 uppercase tracking-wide text-slate-500">
          Active Cryptographic Session Details
        </h3>
        <div class="mt-4 grid grid-cols-1 md:grid-cols-4 gap-4 text-xs">
          <div class="bg-slate-50 p-3 rounded-lg border border-slate-100">
            <div class="text-slate-400 font-medium">User ID (sub)</div>
            <div class="font-mono font-semibold text-slate-800 mt-1 truncate">{{ auth.activePersona().id }}</div>
          </div>
          <div class="bg-slate-50 p-3 rounded-lg border border-slate-100">
            <div class="text-slate-400 font-medium">Roles Claim</div>
            <div class="font-mono font-semibold text-indigo-700 mt-1 truncate">{{ auth.activePersona().roles.join(', ') }}</div>
          </div>
          <div class="bg-slate-50 p-3 rounded-lg border border-slate-100">
            <div class="text-slate-400 font-medium">Department</div>
            <div class="font-semibold text-slate-800 mt-1">{{ auth.activePersona().department }}</div>
          </div>
          <div class="bg-slate-50 p-3 rounded-lg border border-slate-100">
            <div class="text-slate-400 font-medium">Token Length</div>
            <div class="font-mono text-emerald-600 font-semibold mt-1">
              {{ auth.currentToken() ? (auth.currentToken()!.length + ' chars (HS256)') : 'Not authenticated' }}
            </div>
          </div>
        </div>
      </div>
    </div>
  `
})
export class HomeComponent {
  auth = inject(AuthService);
}

import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterOutlet, RouterLink, RouterLinkActive } from '@angular/router';
import { AuthService } from './core/services/auth.service';
import { UserPersona } from './core/models/persona.model';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, RouterOutlet, RouterLink, RouterLinkActive],
  template: `
    <div class="min-h-screen bg-slate-50 flex flex-col font-sans text-slate-800">
      <!-- TOP NAVIGATION BAR -->
      <header class="bg-white border-b border-slate-200 sticky top-0 z-50">
        <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div class="flex justify-between h-16 items-center">
            
            <!-- Brand / Logo -->
            <div class="flex items-center space-x-3">
              <div class="w-10 h-10 rounded-lg bg-indigo-600 flex items-center justify-center text-white font-bold text-xl shadow-md">
                ⚡
              </div>
              <div>
                <span class="text-lg font-bold tracking-tight text-slate-900">Enterprise Workflow</span>
                <span class="ml-2 text-xs font-semibold px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-200">
                  Micro-Frontend Shell
                </span>
              </div>
            </div>

            <!-- Main Navigation Links -->
            <nav class="hidden md:flex space-x-1">
              <a routerLink="/workflows" routerLinkActive="bg-slate-100 text-indigo-600 font-semibold"
                 class="px-3 py-2 rounded-md text-sm font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-50 transition">
                Task Inbox
              </a>
              <a routerLink="/templates" routerLinkActive="bg-slate-100 text-indigo-600 font-semibold"
                 class="px-3 py-2 rounded-md text-sm font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-50 transition">
                Template Studio
              </a>
              <a routerLink="/analytics" routerLinkActive="bg-slate-100 text-indigo-600 font-semibold"
                 class="px-3 py-2 rounded-md text-sm font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-50 transition">
                Audit & Analytics
              </a>
            </nav>

            <!-- Persona Switcher Dropdown & Live Auth Indicator -->
            <div class="flex items-center space-x-4">
              <div class="flex items-center space-x-2 bg-slate-100 p-1.5 rounded-lg border border-slate-200">
                <div class="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold"
                     [ngClass]="auth.activePersona().avatarColor">
                  {{ auth.activePersona().name.substring(0, 2).toUpperCase() }}
                </div>
                <div class="flex flex-col pr-2">
                  <span class="text-xs font-semibold leading-tight text-slate-900">{{ auth.activePersona().name }}</span>
                  <span class="text-[10px] text-slate-500 leading-none">{{ auth.activePersona().role }}</span>
                </div>
                
                <select [value]="auth.activePersona().id" (change)="onPersonaChange($event)"
                        class="text-xs bg-white border border-slate-300 rounded px-2 py-1 text-slate-700 focus:outline-none focus:ring-1 focus:ring-indigo-500">
                  @for (p of auth.personas; track p.id) {
                    <option [value]="p.id">{{ p.name }} ({{ p.role }})</option>
                  }
                </select>
              </div>

              <!-- Auth Status Dot -->
              <div class="flex items-center" title="API Gateway JWT Status">
                @if (auth.isAuthenticating()) {
                  <span class="w-2.5 h-2.5 rounded-full bg-amber-400 animate-ping" title="Minting JWT..."></span>
                } @else if (auth.isAuthenticated()) {
                  <span class="w-2.5 h-2.5 rounded-full bg-emerald-500" title="JWT Active"></span>
                } @else {
                  <span class="w-2.5 h-2.5 rounded-full bg-rose-500" title="Auth Offline"></span>
                }
              </div>
            </div>

          </div>
        </div>
      </header>

      <!-- AUTH ERROR BANNER (IF GATEWAY OFFLINE) -->
      @if (auth.authError()) {
        <div class="bg-amber-50 border-b border-amber-200 px-4 py-2 text-xs text-amber-800 flex justify-between items-center">
          <span>⚠️ <strong>Gateway Notice:</strong> {{ auth.authError() }}. Ensure API Gateway is running on port 8080.</span>
          <button (click)="auth.switchPersona(auth.activePersona())" class="underline font-semibold hover:text-amber-900">
            Retry Connection
          </button>
        </div>
      }

      <!-- MAIN CONTENT ROUTER OUTLET -->
      <main class="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <router-outlet></router-outlet>
      </main>

      <!-- FOOTER -->
      <footer class="bg-white border-t border-slate-200 py-3 text-center text-xs text-slate-500">
        Enterprise Workflow & Event-Driven Audit Platform &bull; Angular 22 Native Federation &bull; Port 4200
      </footer>
    </div>
  `,
  styles: []
})
export class AppComponent {
  auth = inject(AuthService);

  onPersonaChange(event: Event): void {
    const select = event.target as HTMLSelectElement;
    const persona = this.auth.personas.find(p => p.id === select.value);
    if (persona) {
      this.auth.switchPersona(persona);
    }
  }
}

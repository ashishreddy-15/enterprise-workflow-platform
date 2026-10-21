import { Injectable, signal, computed, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { PRECONFIGURED_PERSONAS, UserPersona, DevTokenResponse } from '../models/persona.model';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { dispatchPersonaChanged } from '../utils/auth-bridge.util';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private http = inject(HttpClient);
  private readonly gatewayBaseUrl = environment.gatewayUrl;

  readonly personas = PRECONFIGURED_PERSONAS;
  readonly activePersona = signal<UserPersona>(this.getInitialPersona());
  readonly currentToken = signal<string | null>(localStorage.getItem('ewp_auth_token'));
  readonly isAuthenticating = signal<boolean>(false);
  readonly authError = signal<string | null>(null);

  readonly isAuthenticated = computed(() => !!this.currentToken());

  constructor() {
    // If no token exists yet, authenticate initial persona
    if (!this.currentToken()) {
      this.switchPersona(this.activePersona());
    }
  }

  private getInitialPersona(): UserPersona {
    const saved = localStorage.getItem('ewp_active_persona');
    if (saved) {
      try {
        if (saved.startsWith('{')) {
          return JSON.parse(saved);
        }
        const matched = this.personas.find(p => p.id === saved);
        if (matched) return matched;
      } catch (e) {
        // fallback
      }
    }
    return PRECONFIGURED_PERSONAS[0];
  }

  switchPersona(persona: UserPersona): void {
    this.authenticate(persona.id, persona.roles, persona);
  }

  loginCustom(username: string, role: string, displayName?: string): void {
    const trimmedUser = username.trim();
    const trimmedRole = role.trim();
    const roles = Array.from(new Set([trimmedRole, 'ROLE_EMPLOYEE']));

    const persona: UserPersona = {
      id: trimmedUser,
      name: displayName?.trim() || trimmedUser,
      role: trimmedRole,
      roles: roles,
      department: 'Custom Session',
      avatarColor: 'bg-zinc-800'
    };
    this.authenticate(trimmedUser, roles, persona);
  }

  logout(): void {
    this.currentToken.set(null);
    localStorage.removeItem('ewp_auth_token');
    localStorage.removeItem('ewp_active_persona');
  }

  private authenticate(userId: string, roles: string[], persona: UserPersona): void {
    this.isAuthenticating.set(true);
    this.authError.set(null);
    this.activePersona.set(persona);
    localStorage.setItem('ewp_active_persona', JSON.stringify(persona));

    this.requestDevToken(userId, roles).subscribe({
      next: (res) => {
        this.currentToken.set(res.access_token);
        localStorage.setItem('ewp_auth_token', res.access_token);
        this.isAuthenticating.set(false);

        // Broadcast to all MFEs that the persona & token changed
        dispatchPersonaChanged({ persona, token: res.access_token });
      },
      error: (err) => {
        console.error('Failed to obtain JWT from API Gateway:', err);
        if (!this.currentToken()) {
          this.authError.set('Gateway offline or token generation failed');
        }
        this.isAuthenticating.set(false);
      }
    });
  }

  private requestDevToken(userId: string, roles: string[]): Observable<DevTokenResponse> {
    return this.http.post<DevTokenResponse>(`${this.gatewayBaseUrl}/auth/dev-token`, {
      userId,
      roles
    });
  }
}

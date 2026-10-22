import { Injectable, signal, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { PRECONFIGURED_PERSONAS, UserPersona, DevTokenResponse } from '../models/persona.model';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { dispatchPersonaChanged } from '../utils/auth-bridge.util';

export interface CurrentUserResponse {
  authenticated: boolean;
  userId?: string;
  roles?: string[];
}

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private http = inject(HttpClient);
  private readonly gatewayBaseUrl = environment.gatewayUrl;

  readonly personas = PRECONFIGURED_PERSONAS;
  readonly activePersona = signal<UserPersona>(this.getInitialPersona());
  readonly isAuthenticated = signal<boolean>(false);
  readonly isAuthenticating = signal<boolean>(false);
  readonly authError = signal<string | null>(null);

  constructor() {
    this.checkSession();
  }

  private getInitialPersona(): UserPersona {
    const saved = typeof localStorage !== 'undefined' ? localStorage.getItem('ewp_active_persona') : null;
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

  /**
   * Introspects the Gateway session via /auth/me using HttpOnly cookie credentials.
   * If an active session exists, updates authentication state.
   * If not, establishes a session using the initial persona.
   */
  checkSession(): void {
    this.isAuthenticating.set(true);
    this.http.get<CurrentUserResponse>(`${this.gatewayBaseUrl}/auth/me`, { withCredentials: true }).subscribe({
      next: (res) => {
        if (res && res.authenticated && res.userId) {
          const matched = this.personas.find(p => p.id === res.userId);
          const persona: UserPersona = matched || {
            id: res.userId,
            name: res.userId,
            role: res.roles?.[0] || 'ROLE_EMPLOYEE',
            roles: res.roles && res.roles.length > 0 ? res.roles : ['ROLE_EMPLOYEE'],
            department: 'Enterprise Session',
            avatarColor: 'bg-zinc-800'
          };
          this.activePersona.set(persona);
          this.isAuthenticated.set(true);
          this.isAuthenticating.set(false);
          dispatchPersonaChanged({ persona });
        } else {
          this.switchPersona(this.getInitialPersona());
        }
      },
      error: () => {
        this.switchPersona(this.getInitialPersona());
      }
    });
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
    this.http.post(`${this.gatewayBaseUrl}/auth/logout`, {}, { withCredentials: true }).subscribe({
      next: () => {
        this.isAuthenticated.set(false);
        if (typeof localStorage !== 'undefined') {
          localStorage.removeItem('ewp_active_persona');
        }
      },
      error: () => {
        this.isAuthenticated.set(false);
        if (typeof localStorage !== 'undefined') {
          localStorage.removeItem('ewp_active_persona');
        }
      }
    });
  }

  private authenticate(userId: string, roles: string[], persona: UserPersona): void {
    this.isAuthenticating.set(true);
    this.authError.set(null);
    this.activePersona.set(persona);
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('ewp_active_persona', JSON.stringify(persona));
    }

    this.requestDevToken(userId, roles).subscribe({
      next: () => {
        this.isAuthenticated.set(true);
        this.isAuthenticating.set(false);

        // Broadcast to all MFEs that the persona changed
        dispatchPersonaChanged({ persona });
      },
      error: (err) => {
        console.error('Failed to obtain authentication session from API Gateway:', err);
        if (!this.isAuthenticated()) {
          this.authError.set('Gateway offline or session generation failed');
        }
        this.isAuthenticating.set(false);
      }
    });
  }

  private requestDevToken(userId: string, roles: string[]): Observable<DevTokenResponse> {
    return this.http.post<DevTokenResponse>(
      `${this.gatewayBaseUrl}/auth/dev-token`,
      { userId, roles },
      { withCredentials: true }
    );
  }
}

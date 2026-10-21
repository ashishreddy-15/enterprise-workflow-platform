import { Injectable, signal, computed, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { PRECONFIGURED_PERSONAS, UserPersona, DevTokenResponse } from '../models/persona.model';
import { Observable } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private http = inject(HttpClient);
  private readonly gatewayBaseUrl = 'http://localhost:8080';

  // State Signals
  readonly personas = PRECONFIGURED_PERSONAS;
  readonly activePersona = signal<UserPersona>(PRECONFIGURED_PERSONAS[0]);
  readonly currentToken = signal<string | null>(null);
  readonly isAuthenticating = signal<boolean>(false);
  readonly authError = signal<string | null>(null);

  readonly isAuthenticated = computed(() => !!this.currentToken());

  constructor() {
    // Check localStorage first, otherwise fallback to default
    const savedPersonaId = localStorage.getItem('ewp_active_persona');
    const matched = this.personas.find(p => p.id === savedPersonaId);
    this.switchPersona(matched || this.activePersona());
  }

  switchPersona(persona: UserPersona): void {
    this.isAuthenticating.set(true);
    this.authError.set(null);
    this.activePersona.set(persona);
    localStorage.setItem('ewp_active_persona', persona.id);

    this.requestDevToken(persona.id, persona.roles).subscribe({
      next: (res) => {
        this.currentToken.set(res.access_token);
        this.isAuthenticating.set(false);

        // Broadcast to all MFEs (such as workflow-mfe) that the persona & token changed
        window.dispatchEvent(new CustomEvent('ewp:persona-changed', {
          detail: { persona, token: res.access_token }
        }));
      },
      error: (err) => {
        console.error('Failed to obtain JWT from API Gateway:', err);
        this.authError.set('Gateway offline or token generation failed');
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

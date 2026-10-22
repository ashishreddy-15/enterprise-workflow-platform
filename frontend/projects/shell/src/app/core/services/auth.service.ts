import { Injectable, signal, computed, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { Observable, tap, catchError, of } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthenticatedUser, CurrentUserResponse, LoginRequest, LoginResponse } from '../models/user.model';
import { dispatchPersonaChanged } from '../utils/auth-bridge.util';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private http = inject(HttpClient);
  private router = inject(Router);
  private readonly gatewayBaseUrl = environment.gatewayUrl;

  readonly currentUser = signal<AuthenticatedUser | null>(null);
  readonly isAuthenticated = signal<boolean>(false);
  readonly isAuthenticating = signal<boolean>(false);
  readonly authError = signal<string | null>(null);

  readonly isAdmin = computed(() => {
    return this.currentUser()?.roles.includes('ROLE_ADMIN') ?? false;
  });

  constructor() {
    this.checkSession().subscribe();
  }

  /**
   * Introspects the Gateway session via /auth/me using HttpOnly cookie credentials.
   * If an active session exists, updates authentication state.
   */
  checkSession(): Observable<CurrentUserResponse> {
    this.isAuthenticating.set(true);
    return this.http.get<CurrentUserResponse>(`${this.gatewayBaseUrl}/auth/me`, { withCredentials: true }).pipe(
      tap((res) => {
        this.isAuthenticating.set(false);
        if (res && res.authenticated && res.userId) {
          const user: AuthenticatedUser = {
            userId: res.userId,
            roles: res.roles && res.roles.length > 0 ? res.roles : ['ROLE_EMPLOYEE']
          };
          this.currentUser.set(user);
          this.isAuthenticated.set(true);
          this.authError.set(null);
          this.persistSession(user);
          this.broadcastUser(user);
        } else {
          this.currentUser.set(null);
          this.isAuthenticated.set(false);
          this.persistSession(null);
          this.broadcastUser(null);
        }
      }),
      catchError(() => {
        this.isAuthenticating.set(false);
        this.currentUser.set(null);
        this.isAuthenticated.set(false);
        this.persistSession(null);
        this.broadcastUser(null);
        return of({ authenticated: false });
      })
    );
  }

  /**
   * Authenticates against the backend API Gateway (/auth/login).
   * Backend issues an HttpOnly JWT cookie (ewp_access_token) for subsequent requests.
   */
  login(userId: string, roles: string[]): Observable<LoginResponse> {
    this.isAuthenticating.set(true);
    this.authError.set(null);

    const resolvedRoles = roles && roles.length > 0 ? roles : ['ROLE_EMPLOYEE'];
    const payload: LoginRequest = {
      userId: userId.trim(),
      roles: resolvedRoles
    };

    return this.http.post<LoginResponse>(`${this.gatewayBaseUrl}/auth/login`, payload, { withCredentials: true }).pipe(
      tap(() => {
        const user: AuthenticatedUser = {
          userId: payload.userId,
          roles: payload.roles
        };
        this.currentUser.set(user);
        this.isAuthenticated.set(true);
        this.isAuthenticating.set(false);
        this.persistSession(user);
        this.broadcastUser(user);
      }),
      catchError((err) => {
        this.isAuthenticating.set(false);
        this.authError.set(err?.error?.message || 'Authentication failed. Please verify credentials.');
        throw err;
      })
    );
  }

  /**
   * Invalidates the backend session cookie and clears local auth state.
   */
  logout(): void {
    this.http.post(`${this.gatewayBaseUrl}/auth/logout`, {}, { withCredentials: true }).subscribe({
      next: () => this.handleLoggedOut(),
      error: () => this.handleLoggedOut()
    });
  }

  private handleLoggedOut(): void {
    this.currentUser.set(null);
    this.isAuthenticated.set(false);
    this.authError.set(null);
    this.persistSession(null);
    this.broadcastUser(null);
    this.router.navigate(['/login']);
  }

  hasRole(role: string): boolean {
    return this.currentUser()?.roles.includes(role) ?? false;
  }

  private persistSession(user: AuthenticatedUser | null): void {
    if (typeof localStorage === 'undefined') return;
    if (user) {
      localStorage.setItem('ewp_active_user', JSON.stringify({ userId: user.userId, roles: user.roles }));
      localStorage.setItem('ewp_active_persona', JSON.stringify({ id: user.userId, name: user.userId, roles: user.roles }));
    } else {
      localStorage.removeItem('ewp_active_user');
      localStorage.removeItem('ewp_active_persona');
    }
  }

  private broadcastUser(user: AuthenticatedUser | null): void {
    dispatchPersonaChanged({
      persona: {
        id: user ? user.userId : '',
        name: user ? user.userId : '',
        roles: user ? user.roles : []
      }
    });
  }
}

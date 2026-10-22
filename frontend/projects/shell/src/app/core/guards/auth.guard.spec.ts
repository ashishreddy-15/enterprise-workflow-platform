import { TestBed } from '@angular/core/testing';
import { Router, UrlTree } from '@angular/router';
import { signal } from '@angular/core';
import { Observable, firstValueFrom, of } from 'rxjs';
import { authGuard } from './auth.guard';
import { AuthService } from '../services/auth.service';

describe('authGuard', () => {
  let router: Router;
  const isAuthenticatedSignal = signal<boolean>(false);

  const mockAuthService = {
    isAuthenticated: isAuthenticatedSignal,
    checkSession: () => of({ authenticated: isAuthenticatedSignal() })
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: mockAuthService }
      ]
    });

    router = TestBed.inject(Router);
    isAuthenticatedSignal.set(false);
  });

  it('should allow navigation when user is authenticated', () => {
    isAuthenticatedSignal.set(true);

    const result = TestBed.runInInjectionContext(() => authGuard({} as any, { url: '/workflows' } as any));
    expect(result).toBe(true);
  });

  it('should redirect to /login when user is not authenticated', async () => {
    isAuthenticatedSignal.set(false);

    const result$ = TestBed.runInInjectionContext(() => authGuard({} as any, { url: '/workflows' } as any)) as Observable<any>;
    const result = await firstValueFrom(result$);

    expect(result instanceof UrlTree).toBe(true);
    expect((result as UrlTree).toString()).toContain('/login?returnUrl=%2Fworkflows');
  });
});

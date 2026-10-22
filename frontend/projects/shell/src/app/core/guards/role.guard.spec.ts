import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, Router, UrlTree } from '@angular/router';
import { signal } from '@angular/core';
import { roleGuard } from './role.guard';
import { AuthService } from '../services/auth.service';
import { PRECONFIGURED_PERSONAS } from '../models/persona.model';

describe('roleGuard', () => {
  let router: Router;
  const activePersonaSignal = signal(PRECONFIGURED_PERSONAS[0]); // Ashish Reddy: ROLE_EMPLOYEE

  const mockAuthService = {
    activePersona: activePersonaSignal,
    isAdmin: () => activePersonaSignal().roles.includes('ROLE_ADMIN')
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: mockAuthService }
      ]
    });

    router = TestBed.inject(Router);
    activePersonaSignal.set(PRECONFIGURED_PERSONAS[0]); // Non-admin
  });

  it('should redirect non-admin user to /access-denied', () => {
    // Ashish Reddy (ROLE_EMPLOYEE) lacks ROLE_ADMIN
    const route = { routeConfig: { path: 'templates' } } as ActivatedRouteSnapshot;
    const result = TestBed.runInInjectionContext(() => roleGuard(route, {} as any));

    expect(result instanceof UrlTree).toBe(true);
    const tree = result as UrlTree;
    expect(tree.toString()).toContain('/access-denied?target=templates');
  });

  it('should allow access if user is Administrator (ROLE_ADMIN)', () => {
    // Switch to Platform Administrator
    activePersonaSignal.set(PRECONFIGURED_PERSONAS[3]); // usr_admin_system with ROLE_ADMIN

    const route = { routeConfig: { path: 'templates' } } as ActivatedRouteSnapshot;
    const result = TestBed.runInInjectionContext(() => roleGuard(route, {} as any));

    expect(result).toBe(true);
  });
});

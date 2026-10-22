import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, Router, UrlTree } from '@angular/router';
import { signal } from '@angular/core';
import { roleGuard } from './role.guard';
import { AuthService } from '../services/auth.service';
import { PermissionConfigService } from '../services/permission-config.service';
import { PRECONFIGURED_PERSONAS } from '../models/persona.model';

describe('roleGuard', () => {
  let router: Router;
  const activePersonaSignal = signal(PRECONFIGURED_PERSONAS[0]); // Ashish Reddy: ROLE_EMPLOYEE

  const mockAuthService = {
    activePersona: activePersonaSignal
  };

  const mockPermissionService = {
    canAccessRoute: (route: string, roles: string[]) => {
      if (route === 'workflows' && roles.includes('ROLE_EMPLOYEE')) return true;
      if (route === 'templates' && roles.includes('ROLE_ADMIN')) return true;
      if (route === 'unrestricted') return true;
      return false;
    }
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: mockAuthService },
        { provide: PermissionConfigService, useValue: mockPermissionService }
      ]
    });

    router = TestBed.inject(Router);
    activePersonaSignal.set(PRECONFIGURED_PERSONAS[0]); // Reset to Ashish Reddy
  });

  it('should allow access if user has required role for route', () => {
    const route = { routeConfig: { path: 'workflows' } } as ActivatedRouteSnapshot;
    const result = TestBed.runInInjectionContext(() => roleGuard(route, {} as any));

    expect(result).toBe(true);
  });

  it('should redirect to /access-denied if user lacks required role', () => {
    // Ashish Reddy lacks ROLE_ADMIN -> access denied for templates
    const route = { routeConfig: { path: 'templates' } } as ActivatedRouteSnapshot;
    const result = TestBed.runInInjectionContext(() => roleGuard(route, {} as any));

    expect(result instanceof UrlTree).toBe(true);
    const tree = result as UrlTree;
    expect(tree.toString()).toContain('/access-denied?target=templates');
  });

  it('should allow access to unrestricted routes', () => {
    const route = { routeConfig: { path: 'unrestricted' } } as ActivatedRouteSnapshot;
    const result = TestBed.runInInjectionContext(() => roleGuard(route, {} as any));

    expect(result).toBe(true);
  });
});

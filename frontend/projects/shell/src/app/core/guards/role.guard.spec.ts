import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, Router, UrlTree } from '@angular/router';
import { signal } from '@angular/core';
import { roleGuard } from './role.guard';
import { AuthService } from '../services/auth.service';

describe('roleGuard', () => {
  let router: Router;
  const isAdminSignal = signal<boolean>(false);

  const mockAuthService = {
    isAdmin: isAdminSignal
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: mockAuthService }
      ]
    });

    router = TestBed.inject(Router);
    isAdminSignal.set(false); // Default non-admin
  });

  it('should redirect non-admin user to /access-denied', () => {
    isAdminSignal.set(false);

    const route = { routeConfig: { path: 'templates' } } as ActivatedRouteSnapshot;
    const result = TestBed.runInInjectionContext(() => roleGuard(route, {} as any));

    expect(result instanceof UrlTree).toBe(true);
    const tree = result as UrlTree;
    expect(tree.toString()).toContain('/access-denied?target=templates');
  });

  it('should allow access if user is Administrator (ROLE_ADMIN)', () => {
    isAdminSignal.set(true);

    const route = { routeConfig: { path: 'templates' } } as ActivatedRouteSnapshot;
    const result = TestBed.runInInjectionContext(() => roleGuard(route, {} as any));

    expect(result).toBe(true);
  });
});

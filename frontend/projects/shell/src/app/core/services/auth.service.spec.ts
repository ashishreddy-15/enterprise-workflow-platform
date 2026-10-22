import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { provideRouter, Router } from '@angular/router';
import { vi } from 'vitest';
import { AuthService } from './auth.service';
import { environment } from '../../../environments/environment';

describe('AuthService', () => {
  let service: AuthService;
  let httpMock: HttpTestingController;
  let router: Router;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [provideRouter([]), AuthService]
    });

    service = TestBed.inject(AuthService);
    httpMock = TestBed.inject(HttpTestingController);
    router = TestBed.inject(Router);

    // Drain initial checkSession call from constructor
    const initReq = httpMock.expectOne(`${environment.gatewayUrl}/auth/me`);
    expect(initReq.request.method).toBe('GET');
    expect(initReq.request.withCredentials).toBe(true);
    initReq.flush({ authenticated: false });
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should initialize with unauthenticated state when session is empty', () => {
    expect(service.isAuthenticated()).toBe(false);
    expect(service.currentUser()).toBeNull();
    expect(service.isAdmin()).toBe(false);
  });

  it('should authenticate user and store roles upon login', () => {
    service.login('ashish', ['ROLE_EMPLOYEE']).subscribe();

    const req = httpMock.expectOne(`${environment.gatewayUrl}/auth/login`);
    expect(req.request.method).toBe('POST');
    expect(req.request.withCredentials).toBe(true);
    expect(req.request.body).toEqual({ userId: 'ashish', roles: ['ROLE_EMPLOYEE'] });
    req.flush({ token: 'jwt-token', status: 'authenticated', userId: 'ashish', roles: 'ROLE_EMPLOYEE' });

    expect(service.isAuthenticated()).toBe(true);
    expect(service.currentUser()?.userId).toBe('ashish');
    expect(service.hasRole('ROLE_EMPLOYEE')).toBe(true);
    expect(service.isAdmin()).toBe(false);
  });

  it('should identify administrator role when authenticated with ROLE_ADMIN', () => {
    service.login('admin.sys', ['ROLE_ADMIN', 'ROLE_EMPLOYEE']).subscribe();

    const req = httpMock.expectOne(`${environment.gatewayUrl}/auth/login`);
    req.flush({ token: 'admin-jwt', status: 'authenticated', userId: 'admin.sys', roles: 'ROLE_ADMIN,ROLE_EMPLOYEE' });

    expect(service.isAuthenticated()).toBe(true);
    expect(service.isAdmin()).toBe(true);
    expect(service.hasRole('ROLE_ADMIN')).toBe(true);
  });

  it('should clear session state and navigate to /login on logout', () => {
    const navSpy = vi.spyOn(router, 'navigate');

    service.logout();

    const req = httpMock.expectOne(`${environment.gatewayUrl}/auth/logout`);
    expect(req.request.method).toBe('POST');
    expect(req.request.withCredentials).toBe(true);
    req.flush({ status: 'logged_out' });

    expect(service.isAuthenticated()).toBe(false);
    expect(service.currentUser()).toBeNull();
    expect(navSpy).toHaveBeenCalledWith(['/login']);
  });
});

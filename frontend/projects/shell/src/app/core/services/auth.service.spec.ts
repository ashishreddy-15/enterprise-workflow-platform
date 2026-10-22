import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { AuthService } from './auth.service';
import { PRECONFIGURED_PERSONAS } from '../models/persona.model';
import { environment } from '../../../environments/environment';

describe('AuthService', () => {
  let service: AuthService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [AuthService]
    });

    service = TestBed.inject(AuthService);
    httpMock = TestBed.inject(HttpTestingController);

    // Initial checkSession request
    const initReq = httpMock.expectOne(`${environment.gatewayUrl}/auth/me`);
    expect(initReq.request.method).toBe('GET');
    expect(initReq.request.withCredentials).toBe(true);
    initReq.flush({ authenticated: false });

    // Fallback switchPersona for initial unauthenticated state
    const devTokenReq = httpMock.expectOne(`${environment.gatewayUrl}/auth/dev-token`);
    expect(devTokenReq.request.method).toBe('POST');
    expect(devTokenReq.request.withCredentials).toBe(true);
    devTokenReq.flush({ access_token: 'mock-token', token_type: 'Bearer', expires_in: '28800' });
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should authenticate initial persona successfully', () => {
    expect(service.isAuthenticated()).toBe(true);
    expect(service.activePersona().id).toBe(PRECONFIGURED_PERSONAS[0].id);
    expect(service.isAdmin()).toBe(false);
    expect(service.hasRole('ROLE_EMPLOYEE')).toBe(true);
  });

  it('should correctly report isAdmin when switching to admin persona', () => {
    const adminPersona = PRECONFIGURED_PERSONAS[3]; // Platform Administrator
    service.switchPersona(adminPersona);

    const req = httpMock.expectOne(`${environment.gatewayUrl}/auth/dev-token`);
    req.flush({ access_token: 'token-admin', token_type: 'Bearer', expires_in: '28800' });

    expect(service.isAdmin()).toBe(true);
    expect(service.hasRole('ROLE_ADMIN')).toBe(true);
  });

  it('should switch persona and send withCredentials: true', () => {
    const targetPersona = PRECONFIGURED_PERSONAS[1];
    service.switchPersona(targetPersona);

    const req = httpMock.expectOne(`${environment.gatewayUrl}/auth/dev-token`);
    expect(req.request.method).toBe('POST');
    expect(req.request.withCredentials).toBe(true);
    expect(req.request.body.userId).toBe(targetPersona.id);
    req.flush({ access_token: 'token-legal', token_type: 'Bearer', expires_in: '28800' });

    expect(service.activePersona().id).toBe(targetPersona.id);
    expect(service.isAuthenticated()).toBe(true);
  });

  it('should perform logout and clear authenticated state', () => {
    service.logout();

    const req = httpMock.expectOne(`${environment.gatewayUrl}/auth/logout`);
    expect(req.request.method).toBe('POST');
    expect(req.request.withCredentials).toBe(true);
    req.flush({ message: 'Logged out successfully', authenticated: false });

    expect(service.isAuthenticated()).toBe(false);
  });
});

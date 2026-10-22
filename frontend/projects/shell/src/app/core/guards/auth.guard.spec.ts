import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { authGuard } from './auth.guard';
import { AuthService } from '../services/auth.service';
import { ActivatedRouteSnapshot } from '@angular/router';
import { environment } from '../../../environments/environment';

describe('authGuard', () => {
  let authService: AuthService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        AuthService
      ]
    });

    httpMock = TestBed.inject(HttpTestingController);
    authService = TestBed.inject(AuthService);

    // Drain initial checkSession requests initiated by AuthService
    const initReq = httpMock.expectOne(`${environment.gatewayUrl}/auth/me`);
    initReq.flush({ authenticated: false });
    const devTokenReq = httpMock.expectOne(`${environment.gatewayUrl}/auth/dev-token`);
    devTokenReq.flush({ access_token: 'mock-token', token_type: 'Bearer', expires_in: '28800' });
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should allow navigation when user is authenticated or active persona exists', () => {
    const result = TestBed.runInInjectionContext(() => authGuard({} as ActivatedRouteSnapshot, {} as any));
    expect(result).toBe(true);
  });
});

import { TestBed } from '@angular/core/testing';
import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { authInterceptor } from './auth.interceptor';
import { environment } from '../../../environments/environment';

describe('authInterceptor', () => {
  let http: HttpClient;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting()
      ]
    });

    http = TestBed.inject(HttpClient);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should attach withCredentials: true on gateway requests', () => {
    http.get(`${environment.gatewayUrl}/tasks/inbox`).subscribe();

    const req = httpMock.expectOne(`${environment.gatewayUrl}/tasks/inbox`);
    expect(req.request.withCredentials).toBe(true);
    req.flush([]);
  });

  it('should attach withCredentials: true on relative API routes', () => {
    http.get('/api/v1/workflows').subscribe();

    const req = httpMock.expectOne('/api/v1/workflows');
    expect(req.request.withCredentials).toBe(true);
    req.flush([]);
  });

  it('should not mutate withCredentials on external third-party requests', () => {
    http.get('https://external-service.example.com/data').subscribe();

    const req = httpMock.expectOne('https://external-service.example.com/data');
    expect(req.request.withCredentials).toBe(false);
    req.flush({});
  });
});

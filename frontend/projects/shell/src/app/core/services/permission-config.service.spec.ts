import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { PermissionConfigService } from './permission-config.service';

describe('PermissionConfigService', () => {
  let service: PermissionConfigService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        PermissionConfigService
      ]
    });

    httpMock = TestBed.inject(HttpTestingController);
    service = TestBed.inject(PermissionConfigService);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should initialize with default route permissions', () => {
    const req = httpMock.expectOne('/permissions.config.json');
    req.flush({}); // Respond empty, defaults remain

    expect(service.canAccessRoute('workflows', ['ROLE_EMPLOYEE'])).toBe(true);
    expect(service.canAccessRoute('templates', ['ROLE_EMPLOYEE'])).toBe(false);
    expect(service.canAccessRoute('templates', ['ROLE_ADMIN'])).toBe(true);
    expect(service.canAccessRoute('analytics', ['ROLE_ANALYST'])).toBe(true);
  });

  it('should load dynamic permissions from json configuration', () => {
    const req = httpMock.expectOne('/permissions.config.json');
    req.flush({
      routes: {
        customRoute: {
          title: 'Custom Route',
          requiredRoles: ['ROLE_SPECIAL_AGENT'],
          suggestedPersonaId: 'agent.007'
        }
      }
    });

    expect(service.isLoaded()).toBe(true);
    expect(service.canAccessRoute('customRoute', ['ROLE_SPECIAL_AGENT'])).toBe(true);
    expect(service.canAccessRoute('customRoute', ['ROLE_EMPLOYEE'])).toBe(false);
  });

  it('should allow access to unconfigured routes by default', () => {
    const req = httpMock.expectOne('/permissions.config.json');
    req.flush({});

    expect(service.canAccessRoute('unconfiguredRoute', ['ROLE_ANY'])).toBe(true);
    expect(service.canAccessRoute('unconfiguredRoute', [])).toBe(true);
  });

  it('should deny access if user has no roles for a restricted route', () => {
    const req = httpMock.expectOne('/permissions.config.json');
    req.flush({});

    expect(service.canAccessRoute('templates', [])).toBe(false);
  });

  it('should normalize route paths with leading slashes and subpaths', () => {
    const req = httpMock.expectOne('/permissions.config.json');
    req.flush({});

    expect(service.canAccessRoute('/templates/edit/123', ['ROLE_ADMIN'])).toBe(true);
    expect(service.canAccessRoute('/templates/edit/123', ['ROLE_EMPLOYEE'])).toBe(false);
  });
});

import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, ActivatedRoute, Router } from '@angular/router';
import { signal } from '@angular/core';
import { of } from 'rxjs';
import { vi } from 'vitest';
import { AccessDeniedComponent } from './access-denied.component';
import { AuthService } from '../../core/services/auth.service';
import { PermissionConfigService } from '../../core/services/permission-config.service';
import { PRECONFIGURED_PERSONAS } from '../../core/models/persona.model';

describe('AccessDeniedComponent', () => {
  let component: AccessDeniedComponent;
  let fixture: ComponentFixture<AccessDeniedComponent>;
  let router: Router;

  const activePersonaSignal = signal(PRECONFIGURED_PERSONAS[0]); // Ashish Reddy
  const mockAuthService = {
    activePersona: activePersonaSignal,
    personas: PRECONFIGURED_PERSONAS,
    switchPersona: vi.fn((p) => activePersonaSignal.set(p))
  };

  const mockPermissionService = {
    getRouteConfig: (route: string) => {
      if (route === 'templates') {
        return {
          title: 'Workflow Blueprints Studio',
          requiredRoles: ['ROLE_ADMIN'],
          suggestedPersonaId: 'usr_admin_system',
          suggestedPersonaName: 'Platform Administrator'
        };
      }
      return undefined;
    }
  };

  beforeEach(async () => {
    activePersonaSignal.set(PRECONFIGURED_PERSONAS[0]);

    await TestBed.configureTestingModule({
      imports: [AccessDeniedComponent],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: mockAuthService },
        { provide: PermissionConfigService, useValue: mockPermissionService },
        {
          provide: ActivatedRoute,
          useValue: {
            queryParamMap: of(new Map([['target', 'templates']]))
          }
        }
      ]
    }).compileComponents();

    router = TestBed.inject(Router);
    fixture = TestBed.createComponent(AccessDeniedComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create the component', () => {
    expect(component).toBeTruthy();
  });

  it('should extract target route and required roles', () => {
    expect(component.targetRoute()).toBe('templates');
    expect(component.requiredRoles()).toEqual(['ROLE_ADMIN']);
  });

  it('should display the target title and 403 status', () => {
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.textContent).toContain('403 Access Restricted');
    expect(compiled.textContent).toContain('Workflow Blueprints Studio');
  });

  it('should switch persona and navigate when quick switch is clicked', () => {
    const navSpy = vi.spyOn(router, 'navigate');
    component.switchToAuthorizedPersona();

    expect(mockAuthService.switchPersona).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'usr_admin_system' })
    );
    expect(navSpy).toHaveBeenCalledWith(['/templates']);
  });
});

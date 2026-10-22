import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, ActivatedRoute, Router } from '@angular/router';
import { signal } from '@angular/core';
import { of } from 'rxjs';
import { vi } from 'vitest';
import { AccessDeniedComponent } from './access-denied.component';
import { AuthService } from '../../core/services/auth.service';
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

  beforeEach(async () => {
    activePersonaSignal.set(PRECONFIGURED_PERSONAS[0]);

    await TestBed.configureTestingModule({
      imports: [AccessDeniedComponent],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: mockAuthService },
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

  it('should display the 403 status and template studio heading', () => {
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.textContent).toContain('403 Administrator Access Required');
    expect(compiled.textContent).toContain('Workflow Blueprints Studio');
    expect(compiled.textContent).toContain('ROLE_ADMIN');
  });

  it('should identify the administrator persona', () => {
    expect(component.adminPersona()?.id).toBe('usr_admin_system');
  });

  it('should switch persona to admin and navigate to /templates when quick switch is clicked', () => {
    const navSpy = vi.spyOn(router, 'navigate');
    component.switchToAdmin();

    expect(mockAuthService.switchPersona).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'usr_admin_system' })
    );
    expect(navSpy).toHaveBeenCalledWith(['/templates']);
  });
});

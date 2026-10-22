import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, ActivatedRoute } from '@angular/router';
import { signal } from '@angular/core';
import { of } from 'rxjs';
import { AccessDeniedComponent } from './access-denied.component';
import { AuthService } from '../../core/services/auth.service';
import { AuthenticatedUser } from '../../core/models/user.model';

describe('AccessDeniedComponent', () => {
  let component: AccessDeniedComponent;
  let fixture: ComponentFixture<AccessDeniedComponent>;

  const currentUserSignal = signal<AuthenticatedUser | null>({
    userId: 'ashish',
    roles: ['ROLE_EMPLOYEE']
  });

  const mockAuthService = {
    currentUser: currentUserSignal
  };

  beforeEach(async () => {
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
    expect(compiled.textContent).toContain('ashish');
  });

  it('should have a link to sign in as Administrator', () => {
    const compiled = fixture.nativeElement as HTMLElement;
    const adminLink = compiled.querySelector('a[routerLink="/login"]');
    expect(adminLink).toBeTruthy();
    expect(adminLink?.textContent).toContain('Sign In as Administrator');
  });
});

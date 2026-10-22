import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { of } from 'rxjs';
import { vi } from 'vitest';
import { LoginComponent } from './login.component';
import { AuthService } from '../../core/services/auth.service';

describe('LoginComponent', () => {
  let component: LoginComponent;
  let fixture: ComponentFixture<LoginComponent>;
  let router: Router;

  const mockAuthService = {
    isAuthenticated: () => false,
    login: vi.fn(() => of({ token: 'mock-token', status: 'authenticated', userId: 'ashish', roles: 'ROLE_EMPLOYEE' }))
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LoginComponent],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: mockAuthService }
      ]
    }).compileComponents();

    router = TestBed.inject(Router);
    fixture = TestBed.createComponent(LoginComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create the login component', () => {
    expect(component).toBeTruthy();
  });

  it('should render the login form with username and role options', () => {
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('input#username')).toBeTruthy();
    expect(compiled.textContent).toContain('Enterprise Platform Sign In');
    expect(compiled.textContent).toContain('Employee / Requester');
    expect(compiled.textContent).toContain('Platform Administrator');
  });

  it('should submit login credentials to AuthService', () => {
    const navSpy = vi.spyOn(router, 'navigateByUrl');
    component.username.set('test.user');
    component.selectRole('ROLE_ADMIN');

    component.onSubmit();

    expect(mockAuthService.login).toHaveBeenCalledWith('test.user', ['ROLE_ADMIN', 'ROLE_EMPLOYEE']);
    expect(navSpy).toHaveBeenCalledWith('/workflows');
  });
});

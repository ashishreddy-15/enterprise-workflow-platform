import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { environment } from '../../../environments/environment';

interface RoleOption {
  id: string;
  label: string;
  description: string;
}

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './login.component.html'
})
export class LoginComponent implements OnInit {
  private auth = inject(AuthService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);

  readonly username = signal<string>('ashish');
  readonly selectedRole = signal<string>('ROLE_EMPLOYEE');
  readonly customRole = signal<string>('');
  readonly useCustomRole = signal<boolean>(false);
  readonly isSubmitting = signal<boolean>(false);
  readonly errorMessage = signal<string | null>(null);

  readonly roleOptions: RoleOption[] = [
    {
      id: 'ROLE_EMPLOYEE',
      label: 'Employee / Requester',
      description: 'Access to task submission & workflow inbox'
    },
    {
      id: 'ROLE_ADMIN',
      label: 'Platform Administrator',
      description: 'Full access to Blueprint Studio & template management'
    },
    {
      id: 'ROLE_LEGAL_COUNSEL',
      label: 'Legal Counsel',
      description: 'Approval authority for legal & compliance stages'
    },
    {
      id: 'ROLE_FINANCE_APPROVER',
      label: 'Finance Approver',
      description: 'Approval authority for financial budgets & expenditures'
    },
    {
      id: 'ROLE_MANAGER',
      label: 'Operations Manager',
      description: 'Operational team oversight & analytics'
    }
  ];

  ngOnInit(): void {
    // If already logged in, redirect to destination immediately
    if (this.auth.isAuthenticated()) {
      this.navigateAfterLogin();
      return;
    }

    // Check for error parameters (SSO failure or inactivity timeout)
    const errorParam = this.route.snapshot.queryParamMap.get('error');
    if (errorParam === 'session_expired') {
      this.errorMessage.set('Your session expired due to inactivity. Please sign in again to continue.');
    } else if (errorParam) {
      this.errorMessage.set('Enterprise Single Sign-On failed or was cancelled. You can retry or use direct login below.');
    }

    // Check query params for prefilled role or username
    const queryRole = this.route.snapshot.queryParamMap.get('role');
    if (queryRole) {
      const matched = this.roleOptions.find(r => r.id === queryRole);
      if (matched) {
        this.selectedRole.set(matched.id);
        if (matched.id === 'ROLE_ADMIN') {
          this.username.set('admin.sys');
        }
      } else {
        this.useCustomRole.set(true);
        this.customRole.set(queryRole);
      }
    }
  }

  selectRole(roleId: string): void {
    this.useCustomRole.set(false);
    this.selectedRole.set(roleId);
    if (roleId === 'ROLE_ADMIN' && this.username() === 'ashish') {
      this.username.set('admin.sys');
    }
  }

  loginWithSSO(): void {
    window.location.href = `${environment.gatewayUrl}/oauth2/authorization/keycloak`;
  }

  loginWithAzure(): void {
    window.location.href = `${environment.gatewayUrl}/oauth2/authorization/azure`;
  }

  onSubmit(): void {
    const user = this.username().trim();
    if (!user) {
      this.errorMessage.set('Please provide a valid username.');
      return;
    }

    const role = this.useCustomRole() ? this.customRole().trim() : this.selectedRole().trim();
    if (!role) {
      this.errorMessage.set('Please select or specify a role.');
      return;
    }

    this.isSubmitting.set(true);
    this.errorMessage.set(null);

    const roles = Array.from(new Set([role, 'ROLE_EMPLOYEE']));

    this.auth.login(user, roles).subscribe({
      next: () => {
        this.isSubmitting.set(false);
        this.navigateAfterLogin();
      },
      error: (err) => {
        this.isSubmitting.set(false);
        this.errorMessage.set(err?.error?.message || 'Failed to authenticate with API Gateway. Check if backend is running.');
      }
    });
  }

  private navigateAfterLogin(): void {
    const returnUrl = this.route.snapshot.queryParamMap.get('returnUrl') || '/workflows';
    this.router.navigateByUrl(returnUrl);
  }
}

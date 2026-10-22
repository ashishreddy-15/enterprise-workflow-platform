import { Component, HostListener, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterOutlet, RouterLink, RouterLinkActive } from '@angular/router';
import { AuthService } from './core/services/auth.service';
import { PermissionConfigService } from './core/services/permission-config.service';
import { UserPersona } from './core/models/persona.model';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class AppComponent {
  auth = inject(AuthService);
  permissionConfig = inject(PermissionConfigService);

  canAccess(route: string): boolean {
    return this.permissionConfig.canAccessRoute(route, this.auth.activePersona()?.roles || []);
  }

  readonly isLoginModalOpen = signal<boolean>(false);
  readonly customUsername = signal<string>('');
  readonly customDisplayName = signal<string>('');
  readonly selectedRole = signal<string>('ROLE_EMPLOYEE');
  readonly customRoleInput = signal<string>('');
  readonly useCustomRole = signal<boolean>(false);
  readonly loginError = signal<string | null>(null);

  readonly availableRoles = [
    { id: 'ROLE_EMPLOYEE', label: 'Employee / Requester' },
    { id: 'ROLE_LEGAL_COUNSEL', label: 'Legal Counsel (Approver)' },
    { id: 'ROLE_FINANCE_APPROVER', label: 'Finance Manager (Approver)' },
    { id: 'ROLE_ADMIN', label: 'Platform Administrator' },
    { id: 'ROLE_IT_ADMIN', label: 'IT Administrator' },
    { id: 'ROLE_COMPLIANCE_OFFICER', label: 'Compliance & Audit Officer' }
  ];

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.isLoginModalOpen()) {
      this.closeLoginModal();
    }
  }

  openLoginModal(): void {
    const current = this.auth.activePersona();
    this.customUsername.set(current.id);
    this.customDisplayName.set(current.name);
    this.loginError.set(null);
    this.isLoginModalOpen.set(true);
  }

  closeLoginModal(): void {
    this.isLoginModalOpen.set(false);
  }

  selectPreset(p: UserPersona): void {
    this.auth.switchPersona(p);
    this.closeLoginModal();
  }

  submitCustomLogin(): void {
    const username = this.customUsername().trim();
    if (!username) {
      this.loginError.set('Please enter a username or user ID.');
      return;
    }

    const role = this.useCustomRole()
      ? this.customRoleInput().trim()
      : this.selectedRole().trim();

    if (!role) {
      this.loginError.set('Please specify a role.');
      return;
    }

    const displayName = this.customDisplayName().trim() || username;
    this.auth.loginCustom(username, role, displayName);
    this.closeLoginModal();
  }
}

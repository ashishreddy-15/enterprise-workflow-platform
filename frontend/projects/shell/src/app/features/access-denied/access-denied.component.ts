import { Component, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs/operators';
import { AuthService } from '../../core/services/auth.service';
import { UserPersona } from '../../core/models/persona.model';

@Component({
  selector: 'app-access-denied',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './access-denied.component.html'
})
export class AccessDeniedComponent {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  readonly auth = inject(AuthService);

  readonly targetRoute = toSignal(
    this.route.queryParamMap.pipe(map(params => params.get('target') || 'templates')),
    { initialValue: 'templates' }
  );

  readonly adminPersona = computed<UserPersona | undefined>(() => {
    return this.auth.personas.find(p => p.id === 'usr_admin_system' || p.roles.includes('ROLE_ADMIN'));
  });

  switchToAdmin(): void {
    const admin = this.adminPersona();
    if (admin) {
      this.auth.switchPersona(admin);
      this.router.navigate(['/templates']);
    }
  }
}

import { Component, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs/operators';
import { AuthService } from '../../core/services/auth.service';
import { PermissionConfigService } from '../../core/services/permission-config.service';
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
  readonly permissionConfig = inject(PermissionConfigService);

  // Extract 'target' query parameter reactively
  readonly targetRoute = toSignal(
    this.route.queryParamMap.pipe(map(params => params.get('target') || 'restricted area')),
    { initialValue: 'restricted area' }
  );

  readonly policy = computed(() => {
    return this.permissionConfig.getRouteConfig(this.targetRoute());
  });

  readonly targetTitle = computed(() => {
    return this.policy()?.title || this.targetRoute();
  });

  readonly requiredRoles = computed(() => {
    return this.policy()?.requiredRoles || ['ROLE_ADMIN'];
  });

  readonly suggestedPersona = computed<UserPersona | undefined>(() => {
    const suggestedId = this.policy()?.suggestedPersonaId;
    if (!suggestedId) return undefined;
    return this.auth.personas.find(p => p.id === suggestedId);
  });

  switchToAuthorizedPersona(): void {
    const persona = this.suggestedPersona();
    if (persona) {
      this.auth.switchPersona(persona);
      const target = this.targetRoute();
      if (target && target !== 'restricted area') {
        this.router.navigate(['/' + target]);
      } else {
        this.router.navigate(['/']);
      }
    }
  }
}

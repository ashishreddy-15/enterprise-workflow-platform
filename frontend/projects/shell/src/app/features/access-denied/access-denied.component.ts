import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs/operators';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-access-denied',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './access-denied.component.html'
})
export class AccessDeniedComponent {
  private route = inject(ActivatedRoute);
  readonly auth = inject(AuthService);

  readonly targetRoute = toSignal(
    this.route.queryParamMap.pipe(map((params) => params.get('target') || 'templates')),
    { initialValue: 'templates' }
  );
}

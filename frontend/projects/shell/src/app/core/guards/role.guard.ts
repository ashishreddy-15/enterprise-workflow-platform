import { inject } from '@angular/core';
import { CanActivateFn, Router, ActivatedRouteSnapshot } from '@angular/router';
import { AuthService } from '../services/auth.service';

/**
 * Functional Role Guard
 * Restricts Workflow Template creation / Blueprints Studio strictly to Administrator role.
 * Non-admin roles (employees, approvers, analysts) are redirected to /access-denied.
 */
export const roleGuard: CanActivateFn = (route: ActivatedRouteSnapshot) => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (auth.isAdmin()) {
    return true;
  }

  const routePath = route.routeConfig?.path || 'templates';
  return router.createUrlTree(['/access-denied'], {
    queryParams: {
      target: routePath
    }
  });
};

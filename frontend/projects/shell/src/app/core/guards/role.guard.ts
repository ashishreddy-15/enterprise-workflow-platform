import { inject } from '@angular/core';
import { CanActivateFn, Router, ActivatedRouteSnapshot } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { PermissionConfigService } from '../services/permission-config.service';

/**
 * Functional Role Guard
 * Zero hardcoded roles: dynamically checks the route against policies defined
 * in PermissionConfigService and /permissions.config.json.
 * If unauthorized, redirects to the /access-denied view with contextual parameters.
 */
export const roleGuard: CanActivateFn = (route: ActivatedRouteSnapshot) => {
  const auth = inject(AuthService);
  const permissionConfig = inject(PermissionConfigService);
  const router = inject(Router);

  const routePath = route.routeConfig?.path || '';
  const userRoles = auth.activePersona()?.roles || [];

  // Check dynamic configurable policy
  if (permissionConfig.canAccessRoute(routePath, userRoles)) {
    return true;
  }

  // Not permitted: redirect to AccessDeniedComponent with route context
  return router.createUrlTree(['/access-denied'], {
    queryParams: {
      target: routePath
    }
  });
};

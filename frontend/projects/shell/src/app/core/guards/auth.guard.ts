import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { of } from 'rxjs';
import { map, catchError } from 'rxjs/operators';
import { AuthService } from '../services/auth.service';

/**
 * Functional Auth Guard
 * Verifies the user session against the backend API Gateway.
 * If unauthenticated, safely redirects to /login with returnUrl preserved.
 */
export const authGuard: CanActivateFn = (_route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (auth.isAuthenticated()) {
    return true;
  }

  return auth.checkSession().pipe(
    map((res) => {
      if (res && res.authenticated) {
        return true;
      }
      return router.createUrlTree(['/login'], {
        queryParams: { returnUrl: state.url }
      });
    }),
    catchError(() => {
      return of(
        router.createUrlTree(['/login'], {
          queryParams: { returnUrl: state.url }
        })
      );
    })
  );
};

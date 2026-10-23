import { HttpInterceptorFn, HttpErrorResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';

/**
 * Enterprise Auth Interceptor (Gateway-managed HttpOnly cookie session / BFF pattern).
 * 1. Sets withCredentials = true on all API Gateway requests so that the secure HttpOnly
 *    session cookie ('ewp_access_token') is automatically attached by the browser.
 * 2. Catches 401 Unauthorized errors caused by idle session expiration and redirects
 *    the user to the login screen with an informative alert banner.
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const router = inject(Router);

  const isGatewayTarget =
    req.url.startsWith(environment.gatewayUrl) ||
    req.url.startsWith('/api') ||
    req.url.startsWith('/auth') ||
    req.url.startsWith('/workflows') ||
    req.url.startsWith('/templates') ||
    req.url.startsWith('/analytics');

  const clonedReq =
    isGatewayTarget && !req.withCredentials ? req.clone({ withCredentials: true }) : req;

  return next(clonedReq).pipe(
    catchError((err: HttpErrorResponse) => {
      // If unauthorized on a protected resource (not login or initial check), route to login
      if (err.status === 401 && !req.url.includes('/auth/login') && !req.url.includes('/auth/me')) {
        const currentUrl = router.url;
        if (!currentUrl.startsWith('/login')) {
          router.navigate(['/login'], { queryParams: { error: 'session_expired', returnUrl: currentUrl } });
        }
      }
      return throwError(() => err);
    })
  );
};

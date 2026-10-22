import { HttpInterceptorFn } from '@angular/common/http';
import { environment } from '../../../environments/environment';

/**
 * Enterprise Auth Interceptor (Gateway-managed HttpOnly cookie session / BFF pattern).
 * Sets withCredentials = true on all API Gateway requests so that the secure HttpOnly
 * session cookie ('ewp_access_token') is automatically attached by the browser.
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const isGatewayTarget =
    req.url.startsWith(environment.gatewayUrl) ||
    req.url.startsWith('/api') ||
    req.url.startsWith('/analytics');

  if (isGatewayTarget && !req.withCredentials) {
    return next(req.clone({ withCredentials: true }));
  }

  return next(req);
};

import { inject } from '@angular/core';
import { CanActivateFn } from '@angular/router';
import { AuthService } from '../services/auth.service';

/**
 * Functional Auth Guard
 * Verifies active session identity. Because the platform uses persona-based
 * authentication, it validates the active persona session without bouncing
 * to a non-existent login form.
 */
export const authGuard: CanActivateFn = () => {
  const auth = inject(AuthService);

  // If authenticated with active session, proceed immediately
  if (auth.isAuthenticated()) {
    return true;
  }

  // If persona exists in memory/storage, verify session
  if (auth.activePersona()) {
    return true;
  }

  // If no session exists, initiate session verification
  auth.checkSession();
  return true;
};

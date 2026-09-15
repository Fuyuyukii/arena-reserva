import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

export const authGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  if (auth.loggedIn()) return true;
  return inject(Router).createUrlTree(['/login']);
};

export const adminGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  if (auth.isAdmin()) return true;
  return inject(Router).createUrlTree(['/']);
};

/** Admins have no Customer profile, so a page like "Minhas reservas" doesn't apply to them. */
export const customerOnlyGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  if (!auth.isAdmin()) return true;
  return inject(Router).createUrlTree(['/']);
};

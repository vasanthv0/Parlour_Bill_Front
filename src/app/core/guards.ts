import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';
import { Role } from './models';

/** Must be signed in; otherwise go to /login and come back afterwards. */
export const authGuard: CanActivateFn = (_route, state) => {
  const auth = inject(AuthService);
  return auth.user() ? true : inject(Router).createUrlTree(['/login'], { queryParams: { returnUrl: state.url } });
};

/** Only this role may enter. Anyone else is sent to their own area, never shown the other one. */
export const roleGuard = (role: Role): CanActivateFn => () => {
  const auth = inject(AuthService);
  return auth.role() === role ? true : inject(Router).createUrlTree([auth.homePath()]);
};

/** The sign-in page is for signed-out visitors only. */
export const guestGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  return auth.user() ? inject(Router).createUrlTree([auth.homePath()]) : true;
};

/** "/" sends people where they belong. */
export const rootGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  return inject(Router).createUrlTree([auth.user() ? auth.homePath() : '/login']);
};

/** A page the platform admin can switch off for a parlour. Anyone it is switched off for is sent home. */
export const featureGuard = (key: string): CanActivateFn => () => {
  const auth = inject(AuthService);
  return auth.hasFeature(key) ? true : inject(Router).createUrlTree([auth.homePath()]);
};

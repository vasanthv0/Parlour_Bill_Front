import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, switchMap, throwError } from 'rxjs';
import { environment } from '../../environments/environment';
import { AuthService } from './auth.service';

// These endpoints are called before a session exists (or are how one is renewed), so they carry no bearer token.
const TOKENLESS = ['/auth/login', '/auth/refresh', '/auth/logout'];

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  if (!req.url.startsWith(environment.apiUrl)) return next(req);

  const auth = inject(AuthService);
  const path = req.url.slice(environment.apiUrl.length);

  // The custom header makes the browser run a CORS preflight, which blocks cross-site form posts to cookie endpoints.
  const base = req.clone({
    setHeaders: { 'X-Requested-With': 'XMLHttpRequest' },
    withCredentials: path.startsWith('/auth/'), // only auth endpoints receive the refresh cookie
  });
  if (TOKENLESS.includes(path)) return next(base);

  const withToken = (token: string | null) => (token ? base.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : base);

  return next(withToken(auth.accessToken)).pipe(
    catchError((err: unknown) => {
      // The platform admin switched something off while this page was open: update the sidebar and buttons.
      if (err instanceof HttpErrorResponse && err.status === 403 && err.error?.error?.code === 'FEATURE_DISABLED') auth.reloadProfile();

      if (!(err instanceof HttpErrorResponse) || err.status !== 401) return throwError(() => err);

      // Access tokens last 15 minutes; renew once and replay the request.
      if (err.error?.error?.code === 'TOKEN_EXPIRED') {
        return auth.refresh().pipe(
          switchMap((token) => next(withToken(token))),
          catchError((e) => {
            auth.expire();
            return throwError(() => e);
          }),
        );
      }
      auth.expire();
      return throwError(() => err);
    }),
  );
};

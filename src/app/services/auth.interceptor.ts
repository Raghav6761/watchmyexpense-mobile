import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, from, switchMap, throwError } from 'rxjs';

import { AuthService } from './auth.service';

/**
 * Attaches `Authorization: Bearer <jwt>` to every backend request when signed in.
 *
 * Notes:
 * - We await AuthService.whenReady() before passing the request through so a
 *   request fired during app boot doesn't go out without the header just because
 *   we hadn't finished loading the JWT from Preferences yet.
 * - The /auth/url, /auth/callback, /health, and /auth/status endpoints don't
 *   require auth on the server; the header is harmless on those, so we always
 *   add it when present rather than maintaining an allowlist.
 * - On 401 responses we tell AuthService the JWT is dead. That clears local
 *   state and the UI flips to "Connect Google".
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);

  return from(auth.whenReady()).pipe(
    switchMap(() => {
      const jwt = auth.jwt();
      const authedReq = jwt
        ? req.clone({ setHeaders: { Authorization: `Bearer ${jwt}` } })
        : req;
      return next(authedReq);
    }),
    catchError((err) => {
      if (err?.status === 401) {
        auth.handleUnauthorized();
      }
      return throwError(() => err);
    })
  );
};

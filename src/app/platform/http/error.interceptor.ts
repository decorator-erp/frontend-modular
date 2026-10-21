import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { ErrorHandlerService } from './error-handler.service';
import { ToastService } from '../feedback/toast.service';

/**
 * Global HTTP error policy. See `core/http/ERROR-FORMAT.md`.
 *
 *   401  -> NOT HANDLED HERE. `authInterceptor` owns the whole 401 lifecycle: refresh, retry, and
 *           the logout + /login redirect when the refresh itself fails.
 *   403  -> toast
 *   400/409/422 -> silent; the page handles it via [serverErrors]
 *   404  -> silent; caller decides
 *   5xx  -> toast (parsed message when available)
 *   0    -> toast (network/CORS)
 *
 * Errors are always re-thrown so the caller keeps full control.
 *
 * WHY 401 IS ABSENT. This interceptor is registered AFTER `authInterceptor` (`app.config.ts`),
 * which makes it the INNER one — so on the response path its `catchError` runs FIRST. While it
 * cleared tokens and redirected on 401, `authInterceptor.handle401` then read a null token and
 * threw `Missing refresh token` without ever attempting a refresh: every session hard-logged-out
 * at token expiry, and no spec caught it because `auth.interceptor.spec.ts` registers
 * `authInterceptor` alone. Reintroducing a 401 branch here silently breaks token refresh again.
 */
export const errorInterceptor: HttpInterceptorFn = (req, next) => {
  const toast = inject(ToastService);
  const errorHandler = inject(ErrorHandlerService);

  return next(req).pipe(
    catchError((error) => {
      if (!(error instanceof HttpErrorResponse)) {
        return throwError(() => error);
      }

      const status = error.status;
      // The anonymous public intake page owns its own inline states — never layer a global toast
      // over its rendered error/network states.
      const isPublicCall = req.url.includes('/crm/public/');

      if (status === 403) {
        toast.show({
          tone: 'warning',
          message: "You don't have permission to perform this action.",
        });
      } else if (status === 0 && !isPublicCall) {
        toast.show({ tone: 'danger', message: 'Cannot reach the server. Check your connection.' });
      } else if (status >= 500 && !isPublicCall) {
        const msg =
          errorHandler.parse(error).generalMessage || 'Server error. Please try again later.';
        toast.show({ tone: 'danger', message: msg });
      }

      return throwError(() => error);
    }),
  );
};

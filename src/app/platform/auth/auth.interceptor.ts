import { inject } from '@angular/core';
import {
  HttpErrorResponse,
  HttpHandlerFn,
  HttpInterceptorFn,
  HttpRequest,
} from '@angular/common/http';
import { Router } from '@angular/router';
import { catchError, switchMap, throwError } from 'rxjs';
import { TokenService } from './token.service';
import { TokenRefreshService } from './token-refresh.service';
import { AuthStore } from './auth.store';
import { ToastService } from '../feedback/toast.service';

const addToken = (request: HttpRequest<unknown>, token: string): HttpRequest<unknown> =>
  request.clone({ setHeaders: { Authorization: `Bearer ${token}` } });

const skipAuth = (url: string): boolean =>
  url.includes('/api/auth/login') ||
  url.includes('/api/auth/refresh') ||
  url.endsWith('/auth/login') ||
  url.endsWith('/auth/refresh') ||
  // Anonymous CRM public intake (`/api/crm/public/*`): never attach a token or run the 401 refresh flow.
  url.includes('/crm/public/');

/**
 * The logout in progress, or `null`. N concurrent 401s that share one failed refresh each reach
 * `catchError`; without this they would each toast, each POST `/auth/revoke` (into the same per-IP
 * rate limit) and each navigate. Reset when the logout settles.
 */
let bouncing: Promise<void> | null = null;

/**
 * Log out and return to `/login`, preserving where the user was so they land back there after
 * signing in. Single-flight: the first caller toasts (when `sessionEnded`), logs out once and
 * navigates once; concurrent callers join that same logout.
 *
 * `errorInterceptor` used to own this redirect and supplied the `returnUrl`; it no longer handles
 * 401 at all (see `error.interceptor.ts`), so the query param moved here with the rest of the
 * lifecycle. `router.url` is read BEFORE the async logout, and omitted when it is absent or
 * already `/login` — the latter would send the login page back to itself.
 */
const bounceToLogin = (
  authStore: InstanceType<typeof AuthStore>,
  router: Router,
  toast: ToastService,
  sessionEnded: boolean,
): void => {
  if (bouncing) {
    return;
  }

  const returnUrl = router.url;
  const keepReturnUrl = Boolean(returnUrl) && !returnUrl.startsWith('/login');

  if (sessionEnded) {
    toast.show({ tone: 'warning', message: 'Your session has ended — please sign in again' });
  }

  bouncing = authStore
    .logout()
    .then(() =>
      keepReturnUrl
        ? router.navigate(['/login'], { queryParams: { returnUrl } })
        : router.navigate(['/login']),
    )
    .then(() => undefined)
    .finally(() => (bouncing = null));
};

/**
 * Refresh once, then retry the request that 401'd.
 *
 * The single-flight guard lives in {@link TokenRefreshService}, not here: the permission poll
 * repairs a drifted token through the same service, and refresh tokens are single-use on the
 * backend, so two uncoordinated refreshes would leave the second with `InvalidRefreshToken` —
 * i.e. the `catchError` below, i.e. a forced logout. Concurrent 401s now join one shared
 * refresh rather than a subject local to this module.
 *
 * This interceptor owns the 401 lifecycle OUTRIGHT. `errorInterceptor` is registered after it
 * (`app.config.ts`) and is therefore the INNER interceptor, so its `catchError` fires first: while
 * it still cleared tokens on 401, `tokenService.getToken()` below returned null and the refresh
 * could never run. That is why every session hard-logged-out at token expiry. Do not reintroduce a
 * 401 branch there.
 */
const handle401 = (
  req: HttpRequest<unknown>,
  next: HttpHandlerFn,
  tokenService: TokenService,
  tokenRefresh: TokenRefreshService,
  authStore: InstanceType<typeof AuthStore>,
  router: Router,
  toast: ToastService,
) => {
  const token = tokenService.getToken();
  const refreshToken = tokenService.getRefreshToken();

  if (!token || !refreshToken) {
    bounceToLogin(authStore, router, toast, false);
    return throwError(() => new Error('Missing refresh token'));
  }

  return tokenRefresh.refresh().pipe(
    switchMap((newToken) => {
      authStore.setUserFromToken(newToken);
      return next(addToken(req, newToken));
    }),
    catchError((error) => {
      bounceToLogin(authStore, router, toast, true);
      return throwError(() => error);
    }),
  );
};

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const tokenService = inject(TokenService);
  const tokenRefresh = inject(TokenRefreshService);
  const authStore = inject(AuthStore);
  const router = inject(Router);
  const toast = inject(ToastService);
  const token = tokenService.getToken();
  const request = token && !skipAuth(req.url) ? addToken(req, token) : req;

  return next(request).pipe(
    catchError((error) => {
      if (error instanceof HttpErrorResponse && error.status === 401 && !skipAuth(req.url)) {
        return handle401(request, next, tokenService, tokenRefresh, authStore, router, toast);
      }
      return throwError(() => error);
    }),
  );
};

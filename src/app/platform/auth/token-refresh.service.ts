import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Observable, finalize, map, retry, shareReplay, throwError, timer } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthResponse } from './auth.models';
import { TokenService } from './token.service';

const RETRY_AFTER_DEFAULT_MS = 2_000;
const RETRY_AFTER_CAP_MS = 10_000;

/**
 * How long a 429 asks us to wait: `Retry-After` in whole seconds, 2 s when it is missing or not an
 * integer (an HTTP-date included), never more than 10 s — a user waiting on a click should not sit
 * through a whole rate-limit window.
 */
export function retryAfterMs(error: HttpErrorResponse): number {
  const header = error.headers?.get('Retry-After')?.trim() ?? '';
  if (!/^\d+$/.test(header)) {
    return RETRY_AFTER_DEFAULT_MS;
  }
  return Math.min(Number(header) * 1000, RETRY_AFTER_CAP_MS);
}

/**
 * The ONE place a token refresh is performed, shared by the 401 interceptor and the permission
 * poll's drift repair.
 *
 * Single-flight is a CORRECTNESS requirement here, not an optimisation. Refresh tokens are
 * single-use on the backend: `AuthService.GetRefreshTokenAsync` sets `RevokeOn` on the presented
 * token before issuing a new pair, and the lookup filters on `IsActive`. Two concurrent refreshes
 * presenting the same refresh token therefore leave the second with `InvalidRefreshToken` — which
 * the interceptor turns into a forced logout. That race is correlated rather than rare: the store's
 * focus-triggered refresh fires exactly when someone returns to a tab whose token just expired,
 * which is the same moment the next request 401s.
 *
 * Deliberately depends on `HttpClient` + `TokenService` ONLY — never `AuthStore`, which would be a
 * DI cycle (`AuthStore → TokenRefreshService → AuthStore`). Callers update the store themselves.
 */
@Injectable({ providedIn: 'root' })
export class TokenRefreshService {
  private readonly http = inject(HttpClient);
  private readonly tokenService = inject(TokenService);

  /** The in-flight refresh, or `null` when idle. Joined by concurrent callers. */
  private inFlight$: Observable<string> | null = null;

  /**
   * Refresh the access token, storing the rotated pair. Concurrent callers share ONE POST and
   * therefore one rotation; the caller is responsible for re-deriving any store state from the
   * emitted token.
   *
   * Recursion is impossible by construction: `authInterceptor`'s `skipAuth()` excludes
   * `/auth/refresh` from both token attachment and the 401 handler, so a failing refresh
   * cannot re-enter `handle401` and cannot force a logout on its own.
   */
  refresh(): Observable<string> {
    // No check-then-act window: assignment below is synchronous, so a second synchronous caller
    // sees the same observable rather than starting a second request.
    if (this.inFlight$) {
      return this.inFlight$;
    }

    const token = this.tokenService.getToken();
    const refreshToken = this.tokenService.getRefreshToken();
    if (!token || !refreshToken) {
      return throwError(() => new Error('Missing refresh token'));
    }

    this.inFlight$ = this.http
      .post<AuthResponse>(`${environment.apiUrl}/auth/refresh`, { token, refreshToken })
      .pipe(
        // A 429 is the shared per-IP limiter, not a verdict on the tokens: wait as asked and try
        // once more. Placed before `finalize`/`shareReplay`, so joiners share the retry and the
        // in-flight slot still clears on the final error.
        retry({
          count: 1,
          delay: (error) =>
            error instanceof HttpErrorResponse && error.status === 429
              ? timer(retryAfterMs(error))
              : throwError(() => error),
        }),
        map((response) => {
          this.tokenService.setTokens(response.token, response.refreshToken);
          return response.token;
        }),
        finalize(() => (this.inFlight$ = null)),
        // `refCount: false` so the result survives for late subscribers within the same flight;
        // `finalize` clears the slot so the NEXT call starts a fresh request rather than replaying
        // a stale token.
        shareReplay({ bufferSize: 1, refCount: false }),
      );

    return this.inFlight$;
  }
}

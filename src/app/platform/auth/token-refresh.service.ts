import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, finalize, map, shareReplay, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthResponse } from './auth.models';
import { TokenService } from './token.service';

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

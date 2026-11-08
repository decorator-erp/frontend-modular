import { computed, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { signalStore, withState, withMethods, withComputed, patchState } from '@ngrx/signals';
import { debounceTime, firstValueFrom, fromEvent, timer, Subscription } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthState, AuthResponse, LoginRequest, EffectivePermissionsResponse } from './auth.models';
import { TokenService } from './token.service';
import { TokenRefreshService } from './token-refresh.service';
import { ErrorHandlerService } from '../http/error-handler.service';
import { friendlyMessage } from '../errors/error-catalog';

interface AuthStoreState {
  user: AuthState | null;
  isLoading: boolean;
  error: string | null;
  polling: Subscription | null;
  /**
   * Set once when a token refresh completes and the token STILL disagrees with
   * `/permissions/me/effective`. That means the server is minting tokens that
   * contradict its own effective-permissions read — a backend defect worth surfacing loudly rather
   * than hammering with a retry loop. Cleared on login/logout.
   */
  permissionDriftReported: boolean;
}

/**
 * Order-independent set difference. Size-plus-membership rather than a length check, so a grant
 * AND a revoke landing in the same window (`{A,B}` vs `{A,C}`) is still detected as drift.
 */
function permissionsDiffer(a: readonly string[], b: readonly string[]): boolean {
  const setA = new Set(a);
  const setB = new Set(b);
  return setA.size !== setB.size || [...setA].some((p) => !setB.has(p));
}

export const AuthStore = signalStore(
  { providedIn: 'root' },
  withState<AuthStoreState>({
    user: null,
    isLoading: false,
    error: null,
    polling: null,
    permissionDriftReported: false,
  }),
  withComputed((store) => ({
    isAuthenticated: computed(() => store.user() !== null),
    permissions: computed(() => store.user()?.permissions ?? []),
    roles: computed(() => store.user()?.roles ?? []),
    isSupervisor: computed(() => store.user()?.isSupervisor ?? false),
    /** The CRM client persona (FR-038) — mirrors `hasRole('Client')`, case-insensitively. */
    isClient: computed(
      () => store.user()?.roles.some((r) => r.toLowerCase() === 'client') ?? false,
    ),
  })),
  withMethods(
    (
      store,
      http = inject(HttpClient),
      tokenService = inject(TokenService),
      tokenRefresh = inject(TokenRefreshService),
    ) => ({
      can(permission: string): boolean {
        return store.user()?.permissions.includes(permission) ?? false;
      },

      hasRole(role: string): boolean {
        return store.user()?.roles.includes(role) ?? false;
      },

      setUserFromToken(token: string): void {
        patchState(store, { user: tokenService.parseUser(token), error: null });
      },

      updatePermissions(permissions: string[]): void {
        patchState(store, (state) => ({
          user: state.user ? { ...state.user, permissions } : null,
        }));
      },

      async login(credentials: LoginRequest): Promise<void> {
        patchState(store, { isLoading: true, error: null });
        try {
          const response = await firstValueFrom(
            http.post<AuthResponse>(`${environment.apiUrl}/auth/login`, credentials),
          );
          tokenService.setTokens(response.token, response.refreshToken);
          patchState(store, {
            user: tokenService.parseUser(response.token),
            isLoading: false,
            permissionDriftReported: false,
          });
          // `startPermissionPolling()` is otherwise only ever started from `app.ts`'s
          // `ngOnInit`, which does not re-run on a fresh login — without this, a session that
          // just authenticated has no live permission refresh until the next full page load.
          // `startPermissionPolling()` already no-ops when a subscription exists, so this is
          // safe to call unconditionally (a re-login just rejoins the still-live poll).
          this.startPermissionPolling();
        } catch (err: any) {
          // A 429 from the per-IP auth limiter has an EMPTY body: decide on the status before
          // anything tries to parse it.
          if (err?.status === 429) {
            patchState(store, {
              error: 'Too many sign-in attempts from this network. Wait a minute.',
              isLoading: false,
            });
            return;
          }
          // Use the shared parser so this matches every other error site in the app.
          const parsed = err?.error ? new ErrorHandlerService().parse(err) : null;
          // LockedOut shows the catalog copy; every other code keeps the backend's message.
          const message =
            parsed?.code === 'authentications.LockedOut'
              ? friendlyMessage(parsed.code, parsed.generalMessage)
              : parsed
                ? parsed.generalMessage
                : 'Login failed';
          patchState(store, { error: message || 'Login failed', isLoading: false });
        }
      },

      /**
       * Re-read effective permissions from the server and, if the TOKEN disagrees, repair the token
       * too — so the UI and the API stop healing on different clocks.
       *
       * Without the repair this method is cosmetic: it moves `user.permissions` (which is what
       * `PermissionGuard` and the nav read) while the API keeps authorizing off the claims baked
       * into the JWT at issue time. That gap is what shows a user a screen whose every call 403s.
       */
      async refreshPermissions(): Promise<void> {
        // The user id is no longer part of the URL (`/me/effective` reads it from the token); the
        // guard stays because it still means "signed in".
        const userId = store.user()?.userId;
        if (!userId) {
          return;
        }

        let response: EffectivePermissionsResponse;
        try {
          response = await firstValueFrom(
            http.get<EffectivePermissionsResponse>(
              `${environment.apiUrl}/permissions/me/effective`,
            ),
          );
        } catch {
          // Keep the current UI permissions if this background read fails.
          return;
        }

        // Patch the UI FIRST: it must be correct in the window before a new token arrives.
        patchState(store, (state) => ({
          user: state.user ? { ...state.user, permissions: response.permissions } : null,
        }));

        // Read the token AFTER the response, never before. This GET is itself authorized, so an
        // expired token makes it 401 -> the interceptor refreshes and rotates -> the request
        // retries. By the time we get here the token may ALREADY carry the new permissions, and a
        // token captured before the GET would report phantom drift and fire a redundant refresh.
        const token = tokenService.getToken();
        if (!token) {
          return;
        }

        // Compare against the token's claims, not `store.user().permissions` — the latter was just
        // patched above (and by every prior poll), so comparing to it could never detect drift.
        if (!permissionsDiffer(response.permissions, tokenService.parseUser(token).permissions)) {
          return;
        }

        try {
          const newToken = await firstValueFrom(tokenRefresh.refresh());
          // Re-derive `user` from the NEW token so the store and the token cannot disagree after
          // this point.
          patchState(store, { user: tokenService.parseUser(newToken) });

          // Loop guard: if the freshly minted token STILL disagrees, log once and stop. Do not
          // retry until the next scheduled poll.
          if (
            !store.permissionDriftReported() &&
            permissionsDiffer(response.permissions, tokenService.parseUser(newToken).permissions)
          ) {
            patchState(store, { permissionDriftReported: true });
            console.warn(
              '[auth] Permission drift persists after a token refresh: the issued token disagrees ' +
                'with GET /permissions/me/effective. Not retrying until the next poll.',
            );
          }
        } catch {
          // A failed background refresh must NOT throw the user out of the app. Keep the session
          // and leave the UI permissions as the server reported them above.
        }
      },

      initFromStorage(): void {
        const token = tokenService.getToken();
        if (token && !tokenService.isTokenExpired(token)) {
          patchState(store, { user: tokenService.parseUser(token), error: null });
        } else {
          tokenService.clear();
          patchState(store, { user: null });
        }
      },

      startPermissionPolling(): void {
        if (store.polling()) {
          return;
        }

        // `timer(0, 600_000)` — NOT `interval(600_000)`, which has no leading emission and
        // would leave `user.permissions` running on whatever `initFromStorage` parsed out of
        // the (possibly stale) JWT for a full ten minutes after every reload. The immediate
        // tick relies on `app.ts` calling `initFromStorage()` before this method — `user()`
        // must already be populated, or `refreshPermissions()`'s own guard silently no-ops it.
        const subscription = new Subscription();
        subscription.add(
          timer(0, 600_000).subscribe(() => {
            void this.refreshPermissions();
          }),
        );

        // Ten minutes is a long time to sit on a screen whose calls 403. A permission change is
        // almost always noticed on returning to the tab, so refresh on focus too — debounced, so an
        // alt-tab burst collapses to one. Composed into the same Subscription as the poll, so
        // `stopPermissionPolling()` (and therefore `logout()`) tears both down in one place.
        subscription.add(
          fromEvent(window, 'focus')
            .pipe(debounceTime(1000))
            .subscribe(() => {
              void this.refreshPermissions();
            }),
        );

        patchState(store, { polling: subscription });
      },

      stopPermissionPolling(): void {
        store.polling()?.unsubscribe();
        patchState(store, { polling: null });
      },

      /**
       * Sync W1-12: a user's logout first calls `POST /auth/logout` (authenticated, no body — dms
       * AuthEndpoints.cs:74; it ends the caller's sessions server-side), then the existing
       * `/auth/revoke` drops this refresh token. Neither call can block the logout: any error is
       * swallowed and the local session is cleared. `endServerSession: false` is the interceptor's
       * forced bounce (the session is already dead; a logout there would 401 and could end the
       * user's other live sessions), which keeps the revoke-only teardown.
       */
      async logout(opts: { endServerSession?: boolean } = {}): Promise<void> {
        const token = tokenService.getToken();
        const refreshToken = tokenService.getRefreshToken();
        if (token && opts.endServerSession !== false) {
          await firstValueFrom(http.post(`${environment.apiUrl}/auth/logout`, {})).catch(
            () => undefined,
          );
        }
        if (token && refreshToken) {
          await firstValueFrom(
            http.post(`${environment.apiUrl}/auth/revoke`, { token, refreshToken }),
          ).catch(() => undefined);
        }
        this.stopPermissionPolling();
        tokenService.clear();
        patchState(store, { user: null, permissionDriftReported: false });
      },
    }),
  ),
);

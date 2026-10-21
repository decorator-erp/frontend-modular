import { TestBed } from '@angular/core/testing';
import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Router } from '@angular/router';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { environment } from '../../../environments/environment';
import { authInterceptor } from './auth.interceptor';
import { AuthStore } from './auth.store';
import { TokenService } from './token.service';
import { errorInterceptor } from '../http/error.interceptor';
import { ErrorHandlerService } from '../http/error-handler.service';
import { ToastService } from '../feedback/toast.service';

/**
 * CHARACTERIZATION spec — written against the interceptor as it stood BEFORE the
 * `TokenRefreshService` extraction, and required to pass unmodified after it. Its whole
 * evidentiary value is that ordering: written afterwards it would only prove the new code
 * does what the new code does.
 *
 * Scope is deliberately the 401 retry path this run touches, not the whole interceptor.
 */
describe('authInterceptor — the 401 refresh-and-retry path', () => {
  let http: HttpClient;
  let backend: HttpTestingController;
  let tokenService: {
    getToken: ReturnType<typeof vi.fn>;
    getRefreshToken: ReturnType<typeof vi.fn>;
    setTokens: ReturnType<typeof vi.fn>;
  };
  let authStore: {
    logout: ReturnType<typeof vi.fn>;
    setUserFromToken: ReturnType<typeof vi.fn>;
  };
  let router: { navigate: ReturnType<typeof vi.fn> };

  const PROTECTED = `${environment.apiUrl}/employees`;
  const REFRESH = `${environment.apiUrl}/auth/refresh`;

  beforeEach(() => {
    tokenService = {
      getToken: vi.fn().mockReturnValue('old-token'),
      getRefreshToken: vi.fn().mockReturnValue('old-refresh'),
      setTokens: vi.fn(),
    };
    authStore = {
      logout: vi.fn().mockResolvedValue(undefined),
      setUserFromToken: vi.fn(),
    };
    router = { navigate: vi.fn().mockResolvedValue(true) };

    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        { provide: TokenService, useValue: tokenService },
        { provide: AuthStore, useValue: authStore },
        { provide: Router, useValue: router },
      ],
    });
    http = TestBed.inject(HttpClient);
    backend = TestBed.inject(HttpTestingController);
  });

  afterEach(() => backend.verify());

  it('attaches the current token to a protected request', () => {
    http.get(PROTECTED).subscribe();

    const req = backend.expectOne(PROTECTED);
    expect(req.request.headers.get('Authorization')).toBe('Bearer old-token');
    req.flush([]);
  });

  it('on a 401, refreshes once and retries the original request with the new token', async () => {
    let result: unknown;
    http.get(PROTECTED).subscribe((r) => (result = r));

    backend.expectOne(PROTECTED).flush(null, { status: 401, statusText: 'Unauthorized' });

    // Exactly one refresh — expectOne throws on zero or many.
    const refresh = backend.expectOne(REFRESH);
    expect(refresh.request.method).toBe('POST');
    expect(refresh.request.body).toEqual({ token: 'old-token', refreshToken: 'old-refresh' });
    refresh.flush({ token: 'new-token', refreshToken: 'new-refresh', expiration: '' });

    // The rotated pair is stored and the store is re-derived from the new token.
    expect(tokenService.setTokens).toHaveBeenCalledWith('new-token', 'new-refresh');
    expect(authStore.setUserFromToken).toHaveBeenCalledWith('new-token');

    // The original request is retried, carrying the NEW token, and its response reaches the caller.
    const retried = backend.expectOne(PROTECTED);
    expect(retried.request.headers.get('Authorization')).toBe('Bearer new-token');
    retried.flush([{ id: 'e-1' }]);

    await Promise.resolve();
    expect(result).toEqual([{ id: 'e-1' }]);
    expect(authStore.logout).not.toHaveBeenCalled();
  });

  it('when the refresh itself fails, logs out and navigates to /login', async () => {
    let errored = false;
    http.get(PROTECTED).subscribe({ error: () => (errored = true) });

    backend.expectOne(PROTECTED).flush(null, { status: 401, statusText: 'Unauthorized' });
    backend
      .expectOne(REFRESH)
      .flush({ message: 'nope' }, { status: 400, statusText: 'Bad Request' });

    await Promise.resolve();
    expect(authStore.logout).toHaveBeenCalled();
    await Promise.resolve();
    expect(router.navigate).toHaveBeenCalledWith(['/login']);
    expect(errored).toBe(true);
  });

  it('does not attach a token to, or run the 401 flow for, the refresh route itself', () => {
    // `skipAuth` covers /auth/refresh — this is what makes a failing background refresh
    // unable to re-enter handle401 and force a logout.
    http.post(REFRESH, { token: 'old-token', refreshToken: 'old-refresh' }).subscribe({
      error: () => undefined,
    });

    const req = backend.expectOne(REFRESH);
    expect(req.request.headers.get('Authorization')).toBeNull();
    req.flush(null, { status: 401, statusText: 'Unauthorized' });

    // No second refresh was triggered by that 401.
    backend.expectNone(REFRESH);
    expect(authStore.logout).not.toHaveBeenCalled();
  });

  it('queues a concurrent request behind a single in-flight refresh', async () => {
    http.get(PROTECTED).subscribe();
    http.get(`${environment.apiUrl}/clients`).subscribe();

    backend.expectOne(PROTECTED).flush(null, { status: 401, statusText: 'Unauthorized' });
    backend
      .expectOne(`${environment.apiUrl}/clients`)
      .flush(null, { status: 401, statusText: 'Unauthorized' });

    // Both 401s, but only ONE refresh call — the second waits on the first.
    const refresh = backend.expectOne(REFRESH);
    refresh.flush({ token: 'new-token', refreshToken: 'new-refresh', expiration: '' });

    await Promise.resolve();
    backend.expectOne(PROTECTED).flush([]);
    backend.expectOne(`${environment.apiUrl}/clients`).flush([]);
  });
});

/**
 * The two interceptors TOGETHER, in the order `app.config.ts` registers them.
 *
 * This is the case whose absence let a real bug ship. `errorInterceptor` is registered SECOND and
 * is therefore the INNER interceptor, so on the response path its `catchError` runs BEFORE
 * `authInterceptor`'s. While it cleared tokens on 401, `handle401` then read a null token and threw
 * `Missing refresh token` without ever attempting a refresh — every session hard-logged-out at
 * token expiry. Every spec above passed throughout, because they all register `authInterceptor`
 * alone.
 *
 * The token service here is STATEFUL: `clear()` really does make `getToken()` return null. A bare
 * `vi.fn()` would let the broken arrangement pass and defeat the point of the test.
 */
describe('authInterceptor + errorInterceptor — the real app registration order', () => {
  let http: HttpClient;
  let backend: HttpTestingController;
  let authStore: { logout: ReturnType<typeof vi.fn>; setUserFromToken: ReturnType<typeof vi.fn> };
  let router: { navigate: ReturnType<typeof vi.fn>; url: string };

  const PROTECTED = `${environment.apiUrl}/employees`;
  const REFRESH = `${environment.apiUrl}/auth/refresh`;

  beforeEach(() => {
    let token: string | null = 'old-token';
    let refresh: string | null = 'old-refresh';

    const tokenService = {
      getToken: vi.fn(() => token),
      getRefreshToken: vi.fn(() => refresh),
      setTokens: vi.fn((t: string, r: string) => {
        token = t;
        refresh = r;
      }),
      clear: vi.fn(() => {
        token = null;
        refresh = null;
      }),
    };
    authStore = { logout: vi.fn().mockResolvedValue(undefined), setUserFromToken: vi.fn() };
    router = { navigate: vi.fn().mockResolvedValue(true), url: '/employees' };

    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([authInterceptor, errorInterceptor])),
        provideHttpClientTesting(),
        { provide: TokenService, useValue: tokenService },
        { provide: AuthStore, useValue: authStore },
        { provide: Router, useValue: router },
        { provide: ToastService, useValue: { show: vi.fn() } },
        { provide: ErrorHandlerService, useValue: { parse: () => ({ generalMessage: '' }) } },
      ],
    });
    http = TestBed.inject(HttpClient);
    backend = TestBed.inject(HttpTestingController);
  });

  afterEach(() => backend.verify());

  it('a 401 still refreshes and retries — the tokens are NOT cleared out from under handle401', async () => {
    let result: unknown;
    http.get(PROTECTED).subscribe((r) => (result = r));

    backend.expectOne(PROTECTED).flush(null, { status: 401, statusText: 'Unauthorized' });

    // Reaching a refresh AT ALL is the assertion. With a 401 branch in `errorInterceptor`, the
    // tokens would already be gone and `handle401` would throw before issuing this request.
    backend
      .expectOne(REFRESH)
      .flush({ token: 'new-token', refreshToken: 'new-refresh', expiration: '' });

    const retried = backend.expectOne(PROTECTED);
    expect(retried.request.headers.get('Authorization')).toBe('Bearer new-token');
    retried.flush([{ id: 'e-1' }]);

    await Promise.resolve();
    expect(result).toEqual([{ id: 'e-1' }]);
    expect(authStore.logout).not.toHaveBeenCalled();
    expect(router.navigate).not.toHaveBeenCalled();
  });

  it('when the refresh fails, logs out once and carries the returnUrl to /login', async () => {
    http.get(PROTECTED).subscribe({ error: () => undefined });

    backend.expectOne(PROTECTED).flush(null, { status: 401, statusText: 'Unauthorized' });
    backend.expectOne(REFRESH).flush(null, { status: 400, statusText: 'Bad Request' });

    await Promise.resolve();
    expect(authStore.logout).toHaveBeenCalledTimes(1);
    await Promise.resolve();
    // The returnUrl `errorInterceptor` used to supply now comes from `handle401` instead.
    expect(router.navigate).toHaveBeenCalledWith(['/login'], {
      queryParams: { returnUrl: '/employees' },
    });
  });
});

import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { Router } from '@angular/router';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { environment } from '../../../environments/environment';
import { AuthState } from './auth.models';
import { authInterceptor } from './auth.interceptor';
import { errorInterceptor } from '../http/error.interceptor';
import { ErrorHandlerService } from '../http/error-handler.service';
import { ToastService } from '../feedback/toast.service';
import { AuthStore } from './auth.store';
import { TokenService } from './token.service';

const USER: AuthState = {
  userId: 'user-1',
  userName: 'nourhan',
  email: 'nourhan@pera.test',
  roles: ['Manager'],
  permissions: ['crm.catalog.read'],
  isActive: true,
  isSupervisor: false,
};

function tokenServiceMock() {
  return {
    setTokens: vi.fn(),
    getToken: vi.fn().mockReturnValue(null),
    getRefreshToken: vi.fn().mockReturnValue(null),
    clear: vi.fn(),
    isTokenExpired: vi.fn().mockReturnValue(false),
    parseUser: vi.fn().mockReturnValue(USER),
  };
}

/**
 * Regression coverage for two bugs found chasing why the catalog admin page stayed
 * unreachable after a permission grant: `startPermissionPolling()` used `interval(600_000)`,
 * which has no leading emission, so `user.permissions` ran on whatever `initFromStorage`
 * parsed out of the JWT for a full ten minutes after every reload — masking exactly the
 * "did my new grant land" question this store exists to answer. And `login()` never started
 * polling at all (only `app.ts`'s `ngOnInit` did), so a freshly authenticated session had no
 * live permission refresh until the next full page load.
 */
describe('AuthStore — permission polling', () => {
  let tokenService: ReturnType<typeof tokenServiceMock>;
  let http: HttpTestingController;

  beforeEach(() => {
    vi.useFakeTimers();
    tokenService = tokenServiceMock();
    TestBed.configureTestingModule({
      providers: [
        AuthStore,
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: TokenService, useValue: tokenService },
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    vi.useRealTimers();
    http.verify();
  });

  const store = () => TestBed.inject(AuthStore);

  it('issues a GET /permissions/me/effective immediately and applies the response, without waiting the interval', async () => {
    const s = store();
    s.setUserFromToken('irrelevant-with-the-token-service-mocked');

    s.startPermissionPolling();
    vi.advanceTimersByTime(0); // flush the timer(0, ...) leading tick — no interval elapsed

    const req = http.expectOne(`${environment.apiUrl}/permissions/me/effective`);
    expect(req.request.method).toBe('GET');
    req.flush({ permissions: ['crm.catalog.manage'] });
    await Promise.resolve(); // let firstValueFrom's promise settle and patchState apply

    expect(s.permissions()).toEqual(['crm.catalog.manage']);
  });

  it('does not issue a second refresh until the full interval elapses', () => {
    const s = store();
    s.setUserFromToken('irrelevant-with-the-token-service-mocked');

    s.startPermissionPolling();
    vi.advanceTimersByTime(0);
    http.expectOne(`${environment.apiUrl}/permissions/me/effective`).flush({ permissions: [] });

    vi.advanceTimersByTime(599_999);
    http.expectNone(`${environment.apiUrl}/permissions/me/effective`);

    vi.advanceTimersByTime(1);
    const second = http.expectOne(`${environment.apiUrl}/permissions/me/effective`);
    expect(second.request.method).toBe('GET');
    second.flush({ permissions: [] });
  });

  it('a successful login leaves the poll running, without a page reload', async () => {
    const s = store();

    const loginPromise = s.login({ email: 'nourhan@pera.test', password: 'x' });
    http
      .expectOne(`${environment.apiUrl}/auth/login`)
      .flush({ token: 't', refreshToken: 'r', expiration: '' });
    await loginPromise;

    vi.advanceTimersByTime(0); // the leading tick of the poll login() should have started
    const req = http.expectOne(`${environment.apiUrl}/permissions/me/effective`);
    expect(req.request.method).toBe('GET');
    req.flush({ permissions: [] });
  });

  it('startPermissionPolling() no-ops when a poll is already running — a re-login cannot double-subscribe', () => {
    const s = store();
    s.setUserFromToken('irrelevant-with-the-token-service-mocked');

    s.startPermissionPolling();
    vi.advanceTimersByTime(0);
    http.expectOne(`${environment.apiUrl}/permissions/me/effective`).flush({ permissions: [] });

    s.startPermissionPolling(); // second call — must not start a second subscription
    vi.advanceTimersByTime(0);
    http.expectNone(`${environment.apiUrl}/permissions/me/effective`);
    expect(s.isAuthenticated()).toBe(true);
  });
});

/**
 * A stateful TokenService: `setTokens` actually changes what `getToken`/`parseUser` subsequently
 * return, so a test can express "the refreshed token carries THESE permissions" and the drift
 * comparison is exercised for real rather than against a frozen mock.
 */
function statefulTokenService(initialToken: string, initialPermissions: string[]) {
  const claims = new Map<string, string[]>([[initialToken, initialPermissions]]);
  let token = initialToken;
  let refreshToken = 'refresh-0';

  return {
    claims,
    register: (t: string, permissions: string[]) => claims.set(t, permissions),
    setTokens: vi.fn((t: string, r: string) => {
      token = t;
      refreshToken = r;
    }),
    getToken: vi.fn(() => token),
    getRefreshToken: vi.fn(() => refreshToken),
    clear: vi.fn(),
    isTokenExpired: vi.fn().mockReturnValue(false),
    parseUser: vi.fn((t: string) => ({ ...USER, permissions: claims.get(t) ?? [] })),
  };
}

/**
 * `refreshPermissions()` used to be cosmetic: it patched `user.permissions` — which is what
 * `PermissionGuard` and the nav read — while the API kept authorizing off the claims baked into
 * the JWT at issue time. The two halves healed on different clocks, so for up to an hour the UI
 * would open a screen whose every call 403s. These pin the repair.
 */
describe('AuthStore — permission drift repair', () => {
  let tokenService: ReturnType<typeof statefulTokenService>;
  let http: HttpTestingController;

  const ME = `${environment.apiUrl}/permissions/me/effective`;
  const REFRESH = `${environment.apiUrl}/auth/refresh`;

  beforeEach(() => {
    vi.useFakeTimers();
    tokenService = statefulTokenService('token-0', ['crm.catalog.read']);
    TestBed.configureTestingModule({
      providers: [
        AuthStore,
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: TokenService, useValue: tokenService },
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    vi.useRealTimers();
    http.verify();
  });

  const store = () => TestBed.inject(AuthStore);

  /** Seed a signed-in user, then run one refreshPermissions() cycle. */
  function poll(s: ReturnType<typeof store>): Promise<void> {
    s.setUserFromToken('token-0');
    return s.refreshPermissions();
  }

  it('server set differs from the TOKEN set ⇒ refreshes and replaces the stored token', async () => {
    const s = store();
    tokenService.register('token-1', ['crm.catalog.read', 'crm.catalog.manage']);

    const done = poll(s);
    http.expectOne(ME).flush({
      userId: 'user-1',
      permissions: ['crm.catalog.read', 'crm.catalog.manage'],
      overrides: [],
    });
    await Promise.resolve();

    http.expectOne(REFRESH).flush({ token: 'token-1', refreshToken: 'refresh-1', expiration: '' });
    await done;

    expect(tokenService.setTokens).toHaveBeenCalledWith('token-1', 'refresh-1');
    // The store is re-derived from the NEW token, so store and token cannot disagree after this.
    expect(s.permissions()).toEqual(['crm.catalog.read', 'crm.catalog.manage']);
  });

  it('server set EQUALS the token set ⇒ issues no refresh at all', async () => {
    const s = store();

    const done = poll(s);
    http
      .expectOne(ME)
      .flush({ userId: 'user-1', permissions: ['crm.catalog.read'], overrides: [] });
    await done;

    // The regression this guards: a token call on every poll, for every user, forever.
    http.expectNone(REFRESH);
  });

  it('sets differing only in ORDER ⇒ no refresh (set comparison, not array equality)', async () => {
    const s = store();
    tokenService.claims.set('token-0', ['a', 'b', 'c']);

    const done = poll(s);
    http.expectOne(ME).flush({ userId: 'user-1', permissions: ['c', 'a', 'b'], overrides: [] });
    await done;

    http.expectNone(REFRESH);
  });

  it('a grant AND a revoke in the same window ⇒ still refreshes (not length-based)', async () => {
    const s = store();
    tokenService.claims.set('token-0', ['a', 'b']);
    tokenService.register('token-1', ['a', 'c']);

    const done = poll(s);
    // Same SIZE as the token set, different membership — a length check would miss this.
    http.expectOne(ME).flush({ userId: 'user-1', permissions: ['a', 'c'], overrides: [] });
    await Promise.resolve();

    http.expectOne(REFRESH).flush({ token: 'token-1', refreshToken: 'refresh-1', expiration: '' });
    await done;

    expect(tokenService.setTokens).toHaveBeenCalledWith('token-1', 'refresh-1');
  });

  it('a failed refresh keeps the session, keeps the UI permissions, and does NOT log out', async () => {
    const s = store();

    const done = poll(s);
    http.expectOne(ME).flush({
      userId: 'user-1',
      permissions: ['crm.catalog.read', 'crm.catalog.manage'],
      overrides: [],
    });
    await Promise.resolve();

    http.expectOne(REFRESH).flush(null, { status: 400, statusText: 'Bad Request' });
    await done;

    expect(s.isAuthenticated()).toBe(true);
    expect(tokenService.clear).not.toHaveBeenCalled();
    // The UI still shows what the server reported, even though the token could not be repaired.
    expect(s.permissions()).toEqual(['crm.catalog.read', 'crm.catalog.manage']);
  });

  it('drift persisting after a refresh is logged ONCE and not retried in a loop', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const s = store();
    // The "new" token comes back still carrying the old claims — a backend defect.
    tokenService.register('token-1', ['crm.catalog.read']);

    const first = poll(s);
    http.expectOne(ME).flush({
      userId: 'user-1',
      permissions: ['crm.catalog.read', 'crm.catalog.manage'],
      overrides: [],
    });
    await Promise.resolve();
    http.expectOne(REFRESH).flush({ token: 'token-1', refreshToken: 'refresh-1', expiration: '' });
    await first;

    expect(warn).toHaveBeenCalledTimes(1);
    expect(s.permissionDriftReported()).toBe(true);

    // A second poll still repairs, but must not re-log the same condition.
    tokenService.register('token-2', ['crm.catalog.read']);
    const second = s.refreshPermissions();
    http.expectOne(ME).flush({
      userId: 'user-1',
      permissions: ['crm.catalog.read', 'crm.catalog.manage'],
      overrides: [],
    });
    await Promise.resolve();
    http.expectOne(REFRESH).flush({ token: 'token-2', refreshToken: 'refresh-2', expiration: '' });
    await second;

    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });

  it('a window focus triggers a refresh, and an alt-tab burst debounces to one', async () => {
    const s = store();
    s.setUserFromToken('token-0');
    s.startPermissionPolling();

    // The poll's own leading tick fires first — drain it.
    vi.advanceTimersByTime(0);
    http
      .expectOne(ME)
      .flush({ userId: 'user-1', permissions: ['crm.catalog.read'], overrides: [] });
    await Promise.resolve();

    // An alt-tab burst: four focus events well inside the debounce window.
    window.dispatchEvent(new Event('focus'));
    window.dispatchEvent(new Event('focus'));
    window.dispatchEvent(new Event('focus'));
    window.dispatchEvent(new Event('focus'));
    http.expectNone(ME); // nothing yet — still debouncing

    vi.advanceTimersByTime(1000);
    http
      .expectOne(ME)
      .flush({ userId: 'user-1', permissions: ['crm.catalog.read'], overrides: [] });
    await Promise.resolve();

    s.stopPermissionPolling();
  });

  it('the focus listener is torn down with the poll', async () => {
    const s = store();
    s.setUserFromToken('token-0');
    s.startPermissionPolling();

    vi.advanceTimersByTime(0);
    http
      .expectOne(ME)
      .flush({ userId: 'user-1', permissions: ['crm.catalog.read'], overrides: [] });
    await Promise.resolve();

    s.stopPermissionPolling();

    window.dispatchEvent(new Event('focus'));
    vi.advanceTimersByTime(1000);
    http.expectNone(ME);
  });
});

/**
 * The subtle way the "no-drift path stays quiet" guarantee breaks. The poll's own GET is an
 * authorized request, so an expired token makes it 401 → the interceptor refreshes and rotates →
 * the GET retries. By the time the response lands, the token ALREADY carries the new permissions.
 * A token captured before the GET would therefore report phantom drift and fire a second,
 * redundant refresh. Runs the real interceptor and the real TokenRefreshService end to end.
 */
describe('AuthStore — the poll GET 401s mid-flight', () => {
  let tokenService: ReturnType<typeof statefulTokenService>;
  let http: HttpTestingController;

  const ME = `${environment.apiUrl}/permissions/me/effective`;
  const REFRESH = `${environment.apiUrl}/auth/refresh`;

  beforeEach(() => {
    tokenService = statefulTokenService('token-0', ['crm.catalog.read']);
    TestBed.configureTestingModule({
      providers: [
        AuthStore,
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        { provide: TokenService, useValue: tokenService },
        { provide: Router, useValue: { navigate: vi.fn() } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('the interceptor repairs the token, and the store issues NO second refresh', async () => {
    const s = TestBed.inject(AuthStore);
    // The token the interceptor will mint already carries the new grant.
    tokenService.register('token-1', ['crm.catalog.read', 'crm.catalog.manage']);

    s.setUserFromToken('token-0');
    const done = s.refreshPermissions();

    // The poll's own GET 401s on the expired token.
    http.expectOne(ME).flush(null, { status: 401, statusText: 'Unauthorized' });

    // The interceptor refreshes — this is the ONLY refresh that may occur in this test.
    http.expectOne(REFRESH).flush({ token: 'token-1', refreshToken: 'refresh-1', expiration: '' });
    await Promise.resolve();

    // ...and retries the GET, which now returns the fresh set.
    http.expectOne(ME).flush({
      userId: 'user-1',
      permissions: ['crm.catalog.read', 'crm.catalog.manage'],
      overrides: [],
    });
    await done;

    // The store must compare against the token as it is NOW (already repaired), not as it was
    // before the GET — so no second refresh.
    http.expectNone(REFRESH);
    expect(tokenService.setTokens).toHaveBeenCalledTimes(1);
    expect(s.permissions()).toEqual(['crm.catalog.read', 'crm.catalog.manage']);
  });
});

/**
 * 002b A1. Backend v3 made `GET /permissions/users/{userId}/effective` an administrative read, so
 * a poll against it 403'd for every user without `permissions.manage`, and `errorInterceptor` turned
 * each 403 into a toast: at sign-in, every ten minutes and on every window focus. The poll now reads
 * `/permissions/me/effective`. Runs both interceptors in `app.config.ts` order, so a regression that
 * only swallowed the toast would still fail the zero-requests assertion.
 */
describe('AuthStore — the poll as a user without permissions.manage (002b A1)', () => {
  let tokenService: ReturnType<typeof statefulTokenService>;
  let http: HttpTestingController;
  const toast = { show: vi.fn() };

  const ME = `${environment.apiUrl}/permissions/me/effective`;
  const REFRESH = `${environment.apiUrl}/auth/refresh`;

  beforeEach(() => {
    toast.show.mockClear();
    tokenService = statefulTokenService('token-0', ['crm.catalog.read']);
    TestBed.configureTestingModule({
      providers: [
        AuthStore,
        provideHttpClient(withInterceptors([authInterceptor, errorInterceptor])),
        provideHttpClientTesting(),
        { provide: TokenService, useValue: tokenService },
        { provide: Router, useValue: { navigate: vi.fn(), url: '/projects' } },
        { provide: ToastService, useValue: toast },
        { provide: ErrorHandlerService, useValue: { parse: () => ({ generalMessage: '' }) } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('reads /me/effective, shows no toast, never calls /users/*/effective, and stays quiet', async () => {
    const s = TestBed.inject(AuthStore);
    s.setUserFromToken('token-0');
    const done = s.refreshPermissions();

    // The admin-only route answers 403 to this user; it must never be asked.
    for (const req of http.match((r) => /\/permissions\/users\/[^/]+\/effective$/.test(r.url))) {
      req.flush(null, { status: 403, statusText: 'Forbidden' });
    }
    http
      .expectOne(ME)
      .flush({ userId: 'user-1', permissions: ['crm.catalog.read'], overrides: [] });
    await done;

    expect(http.match((r) => r.url.includes('/permissions/users/'))).toHaveLength(0);
    expect(toast.show).not.toHaveBeenCalled();
    http.expectNone(REFRESH);
    expect(s.permissions()).toEqual(['crm.catalog.read']);
  });
});

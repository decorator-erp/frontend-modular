import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { environment } from '../../../environments/environment';
import { TokenRefreshService } from './token-refresh.service';
import { TokenService } from './token.service';

/**
 * The single-flight guarantee is the whole point of this service: the backend rotates refresh
 * tokens single-use, so a second concurrent refresh presenting the same token gets
 * `InvalidRefreshToken` and the interceptor turns that into a forced logout.
 */
describe('TokenRefreshService', () => {
  let service: TokenRefreshService;
  let backend: HttpTestingController;
  let tokenService: {
    getToken: ReturnType<typeof vi.fn>;
    getRefreshToken: ReturnType<typeof vi.fn>;
    setTokens: ReturnType<typeof vi.fn>;
  };

  const REFRESH = `${environment.apiUrl}/auth/refresh`;

  beforeEach(() => {
    tokenService = {
      getToken: vi.fn().mockReturnValue('old-token'),
      getRefreshToken: vi.fn().mockReturnValue('old-refresh'),
      setTokens: vi.fn(),
    };
    TestBed.configureTestingModule({
      providers: [
        TokenRefreshService,
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: TokenService, useValue: tokenService },
      ],
    });
    service = TestBed.inject(TokenRefreshService);
    backend = TestBed.inject(HttpTestingController);
  });

  afterEach(() => backend.verify());

  it('two concurrent callers share ONE request and both receive the same token', () => {
    const received: string[] = [];
    service.refresh().subscribe((t) => received.push(t));
    service.refresh().subscribe((t) => received.push(t));

    // expectOne throws on a second request — this is the assertion that matters.
    backend
      .expectOne(REFRESH)
      .flush({ token: 'new-token', refreshToken: 'new-refresh', expiration: '' });

    expect(received).toEqual(['new-token', 'new-token']);
  });

  it('stores the rotated pair exactly once for concurrent callers', () => {
    service.refresh().subscribe();
    service.refresh().subscribe();

    backend
      .expectOne(REFRESH)
      .flush({ token: 'new-token', refreshToken: 'new-refresh', expiration: '' });

    expect(tokenService.setTokens).toHaveBeenCalledTimes(1);
    expect(tokenService.setTokens).toHaveBeenCalledWith('new-token', 'new-refresh');
  });

  it('sends the current token pair in the body', () => {
    service.refresh().subscribe();

    const req = backend.expectOne(REFRESH);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ token: 'old-token', refreshToken: 'old-refresh' });
    req.flush({ token: 'new-token', refreshToken: 'new-refresh', expiration: '' });
  });

  it('propagates a failure to every concurrent caller, and stores nothing', () => {
    const errors: unknown[] = [];
    service.refresh().subscribe({ error: (e) => errors.push(e) });
    service.refresh().subscribe({ error: (e) => errors.push(e) });

    backend.expectOne(REFRESH).flush(null, { status: 400, statusText: 'Bad Request' });

    expect(errors).toHaveLength(2);
    expect(tokenService.setTokens).not.toHaveBeenCalled();
  });

  it('a later call, after the first settles, starts a FRESH request — never replays a stale token', () => {
    service.refresh().subscribe();
    backend
      .expectOne(REFRESH)
      .flush({ token: 'token-1', refreshToken: 'refresh-1', expiration: '' });

    let second: string | undefined;
    service.refresh().subscribe((t) => (second = t));
    backend
      .expectOne(REFRESH)
      .flush({ token: 'token-2', refreshToken: 'refresh-2', expiration: '' });

    expect(second).toBe('token-2');
  });

  it('a later call after a FAILED refresh also starts fresh', () => {
    service.refresh().subscribe({ error: () => undefined });
    backend.expectOne(REFRESH).flush(null, { status: 400, statusText: 'Bad Request' });

    let second: string | undefined;
    service.refresh().subscribe((t) => (second = t));
    backend
      .expectOne(REFRESH)
      .flush({ token: 'token-2', refreshToken: 'refresh-2', expiration: '' });

    expect(second).toBe('token-2');
  });

  it('errors without issuing a request when there is no token pair to present', () => {
    tokenService.getRefreshToken.mockReturnValue(null);

    let errored = false;
    service.refresh().subscribe({ error: () => (errored = true) });

    expect(errored).toBe(true);
    backend.expectNone(REFRESH);
  });
});

import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { environment } from '../../../environments/environment';
import { AuthStore } from './auth.store';
import { TokenService } from './token.service';

/** Flush pending promise continuations (firstValueFrom → the next await). */
const tick = async (): Promise<void> => {
  for (let i = 0; i < 5; i++) await Promise.resolve();
};

/** Sync W1-12: logout ends the server session (POST /auth/logout) before the revoke; never blocks. */
describe('AuthStore.logout (sync W1-12)', () => {
  let http: HttpTestingController;
  let tokens: {
    getToken: ReturnType<typeof vi.fn>;
    getRefreshToken: ReturnType<typeof vi.fn>;
    clear: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    tokens = {
      getToken: vi.fn().mockReturnValue('tok'),
      getRefreshToken: vi.fn().mockReturnValue('ref'),
      clear: vi.fn(),
    };
    TestBed.configureTestingModule({
      providers: [
        AuthStore,
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: TokenService, useValue: tokens },
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('POSTs /auth/logout, then /auth/revoke, then clears the local session', async () => {
    const done = TestBed.inject(AuthStore).logout();
    const logout = http.expectOne(`${environment.apiUrl}/auth/logout`);
    expect(logout.request.method).toBe('POST');
    logout.flush(null, { status: 204, statusText: 'No Content' });
    await tick();
    const revoke = http.expectOne(`${environment.apiUrl}/auth/revoke`);
    expect(revoke.request.body).toEqual({ token: 'tok', refreshToken: 'ref' });
    revoke.flush(null, { status: 204, statusText: 'No Content' });
    await done;
    expect(tokens.clear).toHaveBeenCalled();
  });

  it('a failing /auth/logout still revokes and clears', async () => {
    const done = TestBed.inject(AuthStore).logout();
    http
      .expectOne(`${environment.apiUrl}/auth/logout`)
      .flush(null, { status: 500, statusText: 'Server Error' });
    await tick();
    http
      .expectOne(`${environment.apiUrl}/auth/revoke`)
      .flush(null, { status: 400, statusText: 'Bad Request' });
    await done;
    expect(tokens.clear).toHaveBeenCalled();
  });

  it('the forced bounce (endServerSession: false) only revokes', async () => {
    const done = TestBed.inject(AuthStore).logout({ endServerSession: false });
    http.expectNone(`${environment.apiUrl}/auth/logout`);
    http.expectOne(`${environment.apiUrl}/auth/revoke`).flush(null);
    await done;
    expect(tokens.clear).toHaveBeenCalled();
  });

  it('with no token, calls neither route and clears', async () => {
    tokens.getToken.mockReturnValue(null);
    await TestBed.inject(AuthStore).logout();
    http.expectNone(`${environment.apiUrl}/auth/logout`);
    expect(tokens.clear).toHaveBeenCalled();
  });
});

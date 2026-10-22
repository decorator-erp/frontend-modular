import { TestBed } from '@angular/core/testing';
import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { errorInterceptor } from './error.interceptor';
import { handled } from './handled-errors';
import { ToastService } from '../feedback/toast.service';

/** Spec 002c R1: a status the request marks `handled(...)` skips the global toast, nothing else. */
describe('errorInterceptor — handled error statuses', () => {
  let http: HttpClient;
  let backend: HttpTestingController;
  let toast: { show: ReturnType<typeof vi.fn> };
  const URL = '/api/anything';

  beforeEach(() => {
    toast = { show: vi.fn() };
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([errorInterceptor])),
        provideHttpClientTesting(),
        { provide: ToastService, useValue: toast },
      ],
    });
    http = TestBed.inject(HttpClient);
    backend = TestBed.inject(HttpTestingController);
  });

  afterEach(() => backend.verify());

  function fail(status: number, marked: number[] | null): { error: unknown } {
    const seen: { error: unknown } = { error: undefined };
    const options = marked ? { context: handled(...marked) } : {};
    http.get(URL, options).subscribe({ error: (e: unknown) => (seen.error = e) });
    const req = backend.expectOne(URL);
    if (status === 0) {
      req.error(new ProgressEvent('error'), { status: 0 });
    } else {
      req.flush({}, { status, statusText: 'x' });
    }
    return seen;
  }

  it('an unmarked 403 still toasts (unchanged)', () => {
    const seen = fail(403, null);
    expect(toast.show).toHaveBeenCalledTimes(1);
    expect(seen.error).toMatchObject({ status: 403 });
  });

  it('a 403 marked handled(403) shows no toast and is still re-thrown', () => {
    const seen = fail(403, [403]);
    expect(toast.show).not.toHaveBeenCalled();
    expect(seen.error).toMatchObject({ status: 403 });
  });

  it('a 500 on a request marked handled(403) still toasts — only the marked status is silent', () => {
    const seen = fail(500, [403]);
    expect(toast.show).toHaveBeenCalledTimes(1);
    expect(seen.error).toMatchObject({ status: 500 });
  });

  it('an unmarked status 0 still toasts (unchanged)', () => {
    const seen = fail(0, null);
    expect(toast.show).toHaveBeenCalledTimes(1);
    expect(seen.error).toMatchObject({ status: 0 });
  });
});

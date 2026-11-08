import { TestBed } from '@angular/core/testing';
import { HttpContext, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { HANDLED_ERROR_STATUSES } from '@platform/http/handled-errors';
import { AccountService } from './account.service';

/** Sync F5: dms Identity AuthEndpoints.cs:65. */
describe('AccountService (sync F5)', () => {
  it('changePassword POSTs { currentPassword, newPassword } to /auth/change-password, 400/429 handled', () => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    const http = TestBed.inject(HttpTestingController);
    let done = false;
    TestBed.inject(AccountService)
      .changePassword('Old#pass1', 'New#pass2')
      .subscribe(() => (done = true));
    const req = http.expectOne((r) => r.url.endsWith('/auth/change-password'));
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ currentPassword: 'Old#pass1', newPassword: 'New#pass2' });
    const statuses = (req.request.context as HttpContext).get(HANDLED_ERROR_STATUSES);
    expect([...statuses]).toEqual(expect.arrayContaining([400, 429]));
    req.flush(null, { status: 204, statusText: 'No Content' });
    expect(done).toBe(true);
    http.verify();
  });
});

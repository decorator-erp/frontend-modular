import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { Router } from '@angular/router';
import { of, throwError } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { AuthStore } from '@platform/auth/auth.store';
import { ToastService } from '@platform/feedback/toast.service';
import { AccountService } from '../../data/account.service';
import { ChangePasswordCardComponent, unmetPasswordRules } from './change-password-card.component';

const problem = (status: number, errors: Record<string, string[]>) =>
  new HttpErrorResponse({ status, error: { status, errors } });

/** Sync F5: change password on the profile page. */
describe('ChangePasswordCardComponent (sync F5)', () => {
  function make(result: 'ok' | HttpErrorResponse = 'ok') {
    const api = {
      changePassword: vi
        .fn()
        .mockReturnValue(result === 'ok' ? of(undefined) : throwError(() => result)),
    };
    const auth = { logout: vi.fn().mockResolvedValue(undefined) };
    const router = { navigate: vi.fn().mockResolvedValue(true) };
    const toast = { show: vi.fn() };
    TestBed.configureTestingModule({
      imports: [ChangePasswordCardComponent],
      providers: [
        { provide: AccountService, useValue: api },
        { provide: AuthStore, useValue: auth },
        { provide: Router, useValue: router },
        { provide: ToastService, useValue: toast },
      ],
    });
    const c = TestBed.createComponent(ChangePasswordCardComponent).componentInstance;
    return { c, api, auth, router, toast };
  }

  const fill = (c: ChangePasswordCardComponent, next = 'New#pass2', confirm = next) => {
    c.current.set('Old#pass1');
    c.next.set(next);
    c.confirm.set(confirm);
  };

  it('the rules match the backend policy, symbol included', () => {
    expect(unmetPasswordRules('Abcdefg1')).toEqual(['symbol']);
    expect(unmetPasswordRules('abc')).toEqual(['minLength', 'uppercase', 'digit', 'symbol']);
    expect(unmetPasswordRules('New#pass2')).toEqual([]);
  });

  it('refuses a weak, mismatched or unchanged password without calling the API', () => {
    const { c, api } = make();
    fill(c, 'Abcdefg1');
    c.submit();
    expect(c.shown('next')).toBe('The new password needs a symbol.');
    fill(c, 'New#pass2', 'New#pass3');
    c.submit();
    expect(c.shown('confirm')).toBe("The passwords don't match.");
    fill(c, 'Old#pass1');
    c.submit();
    expect(c.shown('next')).toBe('Choose a password different from the current one.');
    expect(api.changePassword).not.toHaveBeenCalled();
  });

  it('sends the current and new password, then signs out to the login page', async () => {
    const { c, api, auth, router, toast } = make();
    fill(c);
    c.submit();
    expect(api.changePassword).toHaveBeenCalledWith('Old#pass1', 'New#pass2');
    await vi.waitFor(() => expect(router.navigate).toHaveBeenCalledWith(['/login']));
    expect(auth.logout).toHaveBeenCalled();
    expect(toast.show).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Password changed. Sign in again with the new password.',
      }),
    );
  });

  it.each([
    [
      'a wrong current password',
      problem(400, { 'authentications.ChangePasswordFailed': ['Incorrect password.'] }),
      'The current password is incorrect.',
    ],
    [
      'a policy failure',
      problem(400, {
        'authentications.ChangePasswordFailed': [
          'Passwords must have at least one non alphanumeric character.',
        ],
      }),
      "The new password doesn't meet the password rules.",
    ],
    [
      'a validation 400',
      problem(400, { 'Request.NewPassword': ['too short'] }),
      "The new password doesn't meet the password rules.",
    ],
    [
      'the rate limit',
      new HttpErrorResponse({ status: 429 }),
      'Too many attempts. Wait a minute and try again.',
    ],
  ])('maps %s to its message and stays signed in', (_label, error, message) => {
    const { c, auth } = make(error);
    fill(c);
    c.submit();
    expect(c.serverError()).toBe(message);
    expect(auth.logout).not.toHaveBeenCalled();
  });
});

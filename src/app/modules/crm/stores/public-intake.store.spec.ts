import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { Observable, of, throwError } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { PublicIntakeApi } from '../data/crm-public-intake.service';
import { PublicIntakeStore } from './public-intake.store';

const body = { firstName: 'Mona', lastName: 'Adel', email: null, phone: null, notes: null };

function make(result: Observable<unknown>) {
  TestBed.configureTestingModule({
    providers: [
      PublicIntakeStore,
      { provide: PublicIntakeApi, useValue: { submit: vi.fn(() => result) } },
    ],
  });
  const store = TestBed.inject(PublicIntakeStore);
  store.submit(body);
  return store;
}

const failure = (status: number) =>
  throwError(() => new HttpErrorResponse({ status, error: null, statusText: 'x' }));

describe('PublicIntakeStore (009b #8) — POST /api/crm/public/leads outcomes', () => {
  it('202 with no body is success', () => {
    expect(make(of(null)).status()).toBe('success');
  });

  it('413 is tooLarge', () => {
    expect(make(failure(413)).status()).toBe('tooLarge');
  });

  it('429 is rateLimited', () => {
    expect(make(failure(429)).status()).toBe('rateLimited');
  });

  it('503 (intake not configured) is unavailable', () => {
    expect(make(failure(503)).status()).toBe('unavailable');
  });
});

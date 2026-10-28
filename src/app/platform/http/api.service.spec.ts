import { Injectable } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { beforeEach, describe, expect, it } from 'vitest';
import { ApiService } from './api.service';

/** Exposes the protected helpers under test. */
@Injectable()
class ProbeApi extends ApiService {
  id(response: unknown, key: string): string {
    return this.unwrapId(response, key);
  }
}

/** 009b X-1: every 201 now carries a one-property body (`{leadId}`, `{itemId}`, …), contract §1.7. */
describe('ApiService.unwrapId (009b X-1)', () => {
  let api: ProbeApi;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [ProbeApi, provideHttpClient()] });
    api = TestBed.inject(ProbeApi);
  });

  it('reads the named key off a 201 body', () => {
    expect(api.id({ leadId: 'L' }, 'leadId')).toBe('L');
  });

  it('reads the key case-insensitively', () => {
    expect(api.id({ BriefSpaceId: 'B' }, 'briefSpaceId')).toBe('B');
  });

  it('falls back to a bare string body', () => {
    expect(api.id('L', 'leadId')).toBe('L');
  });

  it('falls back to a value-wrapped bare string', () => {
    expect(api.id({ value: 'L' }, 'leadId')).toBe('L');
  });

  it('never returns an object as the id', () => {
    expect(api.id({ otherId: 'X' }, 'leadId')).toBe('');
    expect(api.id(null, 'leadId')).toBe('');
  });
});

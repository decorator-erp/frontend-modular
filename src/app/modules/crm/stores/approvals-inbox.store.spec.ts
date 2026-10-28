import { TestBed } from '@angular/core/testing';
import { describe, expect, it, beforeEach } from 'vitest';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ApprovalsInboxStore } from './approvals-inbox.store';

describe('ApprovalsInboxStore', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [ApprovalsInboxStore, provideHttpClient(), provideHttpClientTesting()],
    });
  });

  const store = () => TestBed.inject(ApprovalsInboxStore);

  // 009b #N-2: no portal approvals route exists (EP/CrmPortalEndpoints.cs:36-153).
  describe('load() (009b #N-2)', () => {
    it('issues no request and reports approvals as not available yet', () => {
      const s = store();
      s.load();
      TestBed.inject(HttpTestingController).verify();
      expect(s.error()).toBe('appr.notAvailableYet');
      expect(s.rows()).toEqual([]);
      expect(s.pending()).toEqual([]);
      expect(s.decided()).toEqual([]);
      expect(s.loading()).toBe(false);
    });

    it('offers no client decide', () => {
      expect((store() as unknown as Record<string, unknown>)['decide']).toBeUndefined();
    });
  });
});

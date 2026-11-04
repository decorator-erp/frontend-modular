import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastService } from '@platform/feedback/toast.service';
import { ERROR_MESSAGES } from '@platform/errors/error-catalog';
import { environment } from '../../../../environments/environment';
import { LeadSource, LeadStatus } from '../model/crm-enums';
import { LeadDetailStore } from './lead-detail.store';

describe('LeadDetailStore', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [LeadDetailStore, provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  const url = (path: string) => `${environment.apiUrl}${path}`;
  const store = () => TestBed.inject(LeadDetailStore);
  const lead = {
    id: 'L',
    firstName: 'Mona',
    lastName: 'Adel',
    email: null,
    phone: null,
    source: LeadSource.Phone,
    status: LeadStatus.New,
    ownerId: 'E1',
    notes: null,
    convertedClientId: null,
    convertedAtUtc: null,
  };

  describe('load (009b #5) — the intake is its own GET', () => {
    it('issues GET /leads/L and GET /leads/L/intake and exposes intake from data', () => {
      const s = store();
      s.load('L');

      http.expectOne({ method: 'GET', url: url('/crm/leads/L') }).flush(lead);
      http
        .expectOne({ method: 'GET', url: url('/crm/leads/L/intake') })
        .flush({ leadId: 'L', data: { jobTitle: 'Engineer', areaSqm: 120 } });

      expect(s.lead()?.id).toBe('L');
      expect(s.intake()?.jobTitle).toBe('Engineer');
      expect(s.intake()?.areaSqm).toBe(120);
      expect(s.loading()).toBe(false);
    });

    it('treats an empty data block as an empty intake', () => {
      const s = store();
      s.load('L');
      http.expectOne(url('/crm/leads/L')).flush(lead);
      http.expectOne(url('/crm/leads/L/intake')).flush({ leadId: 'L', data: {} });

      expect(s.intake()).toEqual({});
    });
  });

  describe('upsertIntake (009b #6) — a concurrency 409 reloads', () => {
    it('reloads the lead and intake on 409 crm.leads.ConcurrentUpdate, not onError', () => {
      const s = store();
      let failed = false;
      s.upsertIntake('L', { sector: 1 }, { onError: () => (failed = true) });

      const put = http.expectOne({ method: 'PUT', url: url('/crm/leads/L/intake') });
      expect(put.request.body).toEqual({ sector: 1 });
      put.flush(
        {
          status: 409,
          title: 'crm.leads.ConcurrentUpdate',
          errors: { 'crm.leads.ConcurrentUpdate': ['changed'] },
        },
        { status: 409, statusText: 'Conflict' },
      );

      http.expectOne({ method: 'GET', url: url('/crm/leads/L') }).flush(lead);
      http
        .expectOne({ method: 'GET', url: url('/crm/leads/L/intake') })
        .flush({ leadId: 'L', data: {} });
      expect(failed).toBe(false);
      expect(s.savingIntake()).toBe(false);
    });
  });

  // crm-prod FINDING-P2-24: `updateStatus` marks 403 `handled`, so the store owns its toast — a
  // caller with no `onError` still tells the user.
  describe('changeStatus — 403 (FINDING-P2-24)', () => {
    function withToast() {
      return { show: vi.spyOn(TestBed.inject(ToastService), 'show').mockReturnValue(0) };
    }

    it('a coded 403 with no handlers shows the localized catalog toast once', () => {
      const toast = withToast();
      store().changeStatus('L', LeadStatus.Qualified);
      http
        .expectOne({ method: 'PUT', url: url('/crm/leads/L/status') })
        .flush(
          { status: 403, errors: { 'crm.access.NotAnEmployee': ['x'] } },
          { status: 403, statusText: 'Forbidden' },
        );
      expect(toast.show).toHaveBeenCalledTimes(1);
      expect(toast.show).toHaveBeenCalledWith({
        tone: 'danger',
        message: ERROR_MESSAGES['crm.access.NotAnEmployee'],
      });
      expect(store().changingStatus()).toBe(false);
    });

    it('an uncoded 403 shows http.Forbidden and still reaches onError', () => {
      const toast = withToast();
      const onError = vi.fn();
      store().changeStatus('L', LeadStatus.Qualified, { onError });
      http
        .expectOne(url('/crm/leads/L/status'))
        .flush(null, { status: 403, statusText: 'Forbidden' });
      expect(toast.show).toHaveBeenCalledTimes(1);
      expect(toast.show.mock.calls[0][0].message).toBe(ERROR_MESSAGES['http.Forbidden']);
      expect(onError).toHaveBeenCalledWith(expect.objectContaining({ status: 403 }));
    });

    it('a 422 is left to the caller (no store toast)', () => {
      const toast = withToast();
      store().changeStatus('L', LeadStatus.Qualified);
      http
        .expectOne(url('/crm/leads/L/status'))
        .flush({ errors: { status: ['bad'] } }, { status: 422, statusText: 'Unprocessable' });
      expect(toast.show).not.toHaveBeenCalled();
    });
  });
});

import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { environment } from '../../../../environments/environment';
import { LeadSource, LeadStatus } from '../model/crm-enums';
import { CrmLeadService } from './crm-lead.service';

describe('CrmLeadService', () => {
  let service: CrmLeadService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [CrmLeadService, provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(CrmLeadService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  const url = (path: string) => `${environment.apiUrl}${path}`;

  const wireLead = {
    id: 'L1',
    firstName: 'Mona',
    lastName: 'Adel',
    email: null,
    phone: '0100',
    source: LeadSource.Referral,
    status: LeadStatus.Qualified,
    ownerId: 'E1',
    notes: null,
    convertedClientId: null,
    convertedAtUtc: null,
  };

  describe('search (009b #1) — PagedResult<CrmLeadResponse> on pageNumber/pageSize', () => {
    it('sends pageNumber/pageSize (never skip/take) and reads totalCount off the page', () => {
      let result: unknown;
      service.search().subscribe((r) => (result = r));

      const req = http.expectOne(
        (r) =>
          r.url === url('/crm/leads') &&
          r.params.get('pageNumber') === '1' &&
          r.params.get('pageSize') === '50' &&
          !r.params.has('skip') &&
          !r.params.has('take'),
      );
      expect(req.request.method).toBe('GET');
      req.flush({ items: [wireLead], pageNumber: 1, pageSize: 50, totalCount: 128, totalPages: 3 });

      expect(result).toMatchObject({ totalCount: 128, page: 1, pageSize: 50, totalPages: 3 });
      expect((result as { items: { id: string }[] }).items.map((l) => l.id)).toEqual(['L1']);
    });

    it('moves status, ownerId and search to the server', () => {
      service
        .search({
          pageNumber: 2,
          pageSize: 20,
          status: LeadStatus.New,
          ownerId: 'E1',
          search: 'mo',
        })
        .subscribe();

      const req = http.expectOne((r) => r.url === url('/crm/leads'));
      expect(req.request.params.get('pageNumber')).toBe('2');
      expect(req.request.params.get('pageSize')).toBe('20');
      expect(req.request.params.get('status')).toBe(String(LeadStatus.New));
      expect(req.request.params.get('ownerId')).toBe('E1');
      expect(req.request.params.get('search')).toBe('mo');
      req.flush({ items: [], pageNumber: 2, pageSize: 20, totalCount: 0, totalPages: 0 });
    });

    it('maps a row without a created date (CrmLeadResponse has none)', () => {
      let first: Record<string, unknown> | undefined;
      service.search().subscribe((r) => (first = r.items[0] as unknown as Record<string, unknown>));
      http
        .expectOne((r) => r.url === url('/crm/leads'))
        .flush({ items: [wireLead], pageNumber: 1, pageSize: 50, totalCount: 1, totalPages: 1 });
      expect(first).toBeDefined();
      expect(first).not.toHaveProperty('createdAtUtc');
      expect(first).toMatchObject({ id: 'L1', status: LeadStatus.Qualified, ownerId: 'E1' });
    });
  });

  describe('statusCounts (009b #2) — GET /status-counts under the list filters', () => {
    it('sends the same ownerId/search as the list and reads the six counts', () => {
      let counts: unknown;
      service.statusCounts({ search: 'a', ownerId: 'E1' }).subscribe((c) => (counts = c));

      const req = http.expectOne(
        (r) =>
          r.url === url('/crm/leads/status-counts') &&
          r.params.get('search') === 'a' &&
          r.params.get('ownerId') === 'E1',
      );
      expect(req.request.method).toBe('GET');
      expect(req.request.params.has('pageNumber')).toBe(false);
      req.flush({ total: 9, new: 1, contacted: 2, qualified: 3, unqualified: 1, converted: 2 });

      expect(counts).toEqual({
        total: 9,
        new: 1,
        contacted: 2,
        qualified: 3,
        unqualified: 1,
        converted: 2,
      });
    });
  });

  describe('create (009b #3) — 201 { leadId }, ownerId required', () => {
    it('emits the id read off the one-property 201 body', () => {
      let id: string | undefined;
      service
        .create({ firstName: 'Mona', lastName: 'Adel', source: LeadSource.Phone, ownerId: 'E1' })
        .subscribe((v) => (id = v));

      const req = http.expectOne(url('/crm/leads'));
      expect(req.request.method).toBe('POST');
      expect(req.request.body.ownerId).toBe('E1');
      req.flush({ leadId: 'L1' }, { status: 201, statusText: 'Created' });

      expect(id).toBe('L1');
    });
  });

  describe('convert (009b #7) — body { existingClientId } → 200 { clientId }', () => {
    it('sends exactly { existingClientId } and emits the client id', () => {
      let result: unknown;
      service.convert('L1', { existingClientId: 'C' }).subscribe((r) => (result = r));

      const req = http.expectOne(url('/crm/leads/L1/convert'));
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({ existingClientId: 'C' });
      req.flush({ clientId: 'C' });

      expect(result).toEqual({ clientId: 'C' });
    });
  });

  describe('searchClients (009b #31) — the convert picker reads GET /api/clients', () => {
    it('sends pageNumber/pageSize/search/isActive=true and maps the list rows', () => {
      let result: { items: unknown[]; totalCount: number } | undefined;
      service.searchClients({ search: 'x' }).subscribe((r) => (result = r));

      const req = http.expectOne(
        (r) =>
          r.url === url('/clients') &&
          r.params.get('search') === 'x' &&
          r.params.get('isActive') === 'true' &&
          r.params.get('pageNumber') === '1' &&
          r.params.get('pageSize') === '50',
      );
      expect(req.request.method).toBe('GET');
      req.flush({
        items: [
          {
            id: 'C1',
            displayName: 'Mona Adel',
            email: 'm@x.io',
            address: 'Cairo',
            jobTitle: null,
            representativeName: null,
            isActive: true,
            createdAtUtc: '2026-01-01T00:00:00Z',
          },
        ],
        pageNumber: 1,
        pageSize: 50,
        totalCount: 1,
        totalPages: 1,
      });

      expect(result?.totalCount).toBe(1);
      expect(result?.items[0]).toEqual({ id: 'C1', displayName: 'Mona Adel', email: 'm@x.io' });
    });
  });
});

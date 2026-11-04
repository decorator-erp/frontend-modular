import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { environment } from '../../../../environments/environment';
import { ClientSearchService } from './client-search.service';
import type { ClientResponse } from '../model/client.model';
import type { Paged } from '@platform/types/paged';

/** crm-prod M8: search is `GET /api/clients` (ClientEndpoints.cs:126-147); `/clients/search` does not exist. */
describe('ClientSearchService (crm-prod M8)', () => {
  let service: ClientSearchService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(ClientSearchService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('sends search, isActive, pageNumber and pageSize to GET /clients and reads the PagedResult', () => {
    let page: Paged<ClientResponse> | undefined;
    service
      .search({ searchTerm: 'cairo', isActive: false, page: 2, pageSize: 10 })
      .subscribe((r) => (page = r));

    const call = http.expectOne((r) => r.url === `${environment.apiUrl}/clients`);
    expect(call.request.method).toBe('GET');
    expect(call.request.params.get('search')).toBe('cairo');
    expect(call.request.params.get('isActive')).toBe('false');
    expect(call.request.params.get('pageNumber')).toBe('2');
    expect(call.request.params.get('pageSize')).toBe('10');
    expect(call.request.params.keys().sort()).toEqual([
      'isActive',
      'pageNumber',
      'pageSize',
      'search',
    ]);
    call.flush({
      items: [{ id: 'c1', displayName: 'Hana Saleh', isActive: false }],
      pageNumber: 2,
      pageSize: 10,
      totalCount: 11,
      totalPages: 2,
    });

    expect(page?.items.map((c) => c.id)).toEqual(['c1']);
    expect(page?.totalCount).toBe(11);
    expect(page?.pageIndex).toBe(2);
    expect(page?.totalPages).toBe(2);
  });

  it('an unset status filter asks for both (isActive=all); the finance pickers ask for active ones', () => {
    service.search({}).subscribe();
    const all = http.expectOne((r) => r.url === `${environment.apiUrl}/clients`);
    expect(all.request.params.get('isActive')).toBe('all');
    expect(all.request.params.has('search')).toBe(false);
    all.flush({ items: [], pageNumber: 1, pageSize: 20, totalCount: 0, totalPages: 0 });

    service.search({ pageSize: 200, isActive: true }).subscribe();
    const active = http.expectOne((r) => r.url === `${environment.apiUrl}/clients`);
    expect(active.request.params.get('isActive')).toBe('true');
    expect(active.request.params.get('pageSize')).toBe('200');
    active.flush({ items: [], pageNumber: 1, pageSize: 200, totalCount: 0, totalPages: 0 });
  });
});

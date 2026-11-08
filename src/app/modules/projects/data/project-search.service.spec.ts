import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { environment } from '../../../../environments/environment';
import { ProjectSearchService } from './project-search.service';

/** crmp A-2 (gap table E8): no `/projects/search`; `GET /api/projects?search&clientId&mine` (ProjectEndpoints.cs:26). */
describe('ProjectSearchService (crmp A-2)', () => {
  let service: ProjectSearchService;
  let http: HttpTestingController;
  const url = `${environment.apiUrl}/projects`;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(ProjectSearchService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('sends search, clientId, mine and the required paging to GET /projects', () => {
    service
      .search({ searchTerm: 'vks', clientId: 'C1', mine: true, page: 2, pageSize: 25 })
      .subscribe();
    const r = http.expectOne((x) => x.url === url);
    expect(r.request.method).toBe('GET');
    expect(r.request.params.get('search')).toBe('vks');
    expect(r.request.params.get('clientId')).toBe('C1');
    expect(r.request.params.get('mine')).toBe('true');
    expect(r.request.params.get('pageNumber')).toBe('2');
    expect(r.request.params.get('pageSize')).toBe('25');
    r.flush({ items: [], pageNumber: 2, pageSize: 25, totalCount: 0, totalPages: 0 });
  });

  it('never sends the status, workflowType or sort parameters the backend does not have', () => {
    service
      .search({ status: 'Draft', workflowType: 'Stage', sortBy: 'name', sortDir: 'desc' })
      .subscribe();
    const r = http.expectOne((x) => x.url === url);
    expect(r.request.params.keys().sort()).toEqual(['pageNumber', 'pageSize']);
    r.flush({ items: [] });
  });
});

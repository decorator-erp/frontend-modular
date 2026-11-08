import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { HANDLED_ERROR_STATUSES } from '@platform/http/handled-errors';
import { environment } from '../../../../environments/environment';
import { CrmSitePhotoService } from './crm-site-photo.service';

describe('CrmSitePhotoService (crmp P2-B, SiteEndpoints.cs:42-57, :253-262)', () => {
  let service: CrmSitePhotoService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(CrmSitePhotoService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('lists the project surveys (pageIndex paging) from the paged result', () => {
    let result: unknown;
    service.listSites('P1').subscribe((r) => (result = r));
    const req = http.expectOne((r) => r.url === `${environment.apiUrl}/sites`);
    expect(req.request.method).toBe('GET');
    expect(req.request.params.get('projectId')).toBe('P1');
    expect(req.request.params.get('pageIndex')).toBe('1');
    expect(req.request.params.get('pageSize')).toBe('100');
    expect(req.request.context.get(HANDLED_ERROR_STATUSES)).toEqual([403, 404]);
    req.flush({ items: [{ id: 'SV1', code: 'SV-001', status: 1 }], totalCount: 1 });
    expect(result).toEqual([{ id: 'SV1', code: 'SV-001' }]);
  });

  it("reads a survey's document links", () => {
    let result: unknown;
    service.documents('SV1').subscribe((r) => (result = r));
    const req = http.expectOne(`${environment.apiUrl}/sites/SV1/documents`);
    expect(req.request.method).toBe('GET');
    req.flush([
      { id: 'L1', documentId: 'D1', kind: 3, siteId: 'SV1' },
      { id: 'L2', documentId: 'D2', kind: 'Photo' },
    ]);
    expect(result).toEqual([
      { id: 'L1', documentId: 'D1', kind: 3 },
      { id: 'L2', documentId: 'D2', kind: 3 },
    ]);
  });
});

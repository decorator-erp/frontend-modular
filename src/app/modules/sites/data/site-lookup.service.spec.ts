import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { environment } from '../../../../environments/environment';
import { HANDLED_ERROR_STATUSES } from '@platform/http/handled-errors';
import { SiteLookupService } from './site-lookup.service';

// sites A1 / DEVIATION-18: the cross-module reads are marked handled(403) so they degrade silently.
describe('SiteLookupService (sites A1)', () => {
  let service: SiteLookupService;
  let http: HttpTestingController;
  const url = (path: string) => `${environment.apiUrl}${path}`;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [SiteLookupService, provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(SiteLookupService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('GET /crm/projects/{p}/spaces (403 handled) → active spaces by sortOrder', () => {
    let rows: unknown;
    service.spaces('P').subscribe((r) => (rows = r));
    const req = http.expectOne(url('/crm/projects/P/spaces'));
    expect(req.request.context.get(HANDLED_ERROR_STATUSES)).toEqual([403, 404]);
    req.flush([
      { id: 'B', name: 'Kitchen', sortOrder: 2, isActive: true },
      { id: 'A', name: 'Hall', sortOrder: 1, isActive: true },
      { id: 'C', name: 'Old', sortOrder: 0, isActive: false },
    ]);
    expect(rows).toEqual([
      { id: 'A', name: 'Hall', sortOrder: 1, isActive: true },
      { id: 'B', name: 'Kitchen', sortOrder: 2, isActive: true },
    ]);
  });

  it('GET /crm/catalog/tree and /categories/{id}/items (403 handled), cached', () => {
    let items: unknown;
    service.allCatalogItems().subscribe((r) => (items = r));
    const tree = http.expectOne(url('/crm/catalog/tree'));
    expect(tree.request.context.get(HANDLED_ERROR_STATUSES)).toEqual([403]);
    tree.flush([
      { id: 'K1', parentId: null, nameEn: 'Doors', nameAr: 'أبواب', sortOrder: 1, isActive: true },
    ]);
    const its = http.expectOne(url('/crm/catalog/categories/K1/items'));
    expect(its.request.context.get(HANDLED_ERROR_STATUSES)).toEqual([403, 404]);
    its.flush([
      {
        id: 'C1',
        categoryId: 'K1',
        nameEn: 'Oak door',
        nameAr: 'باب بلوط',
        sortOrder: 1,
        isActive: true,
      },
    ]);
    expect(items).toEqual([
      {
        id: 'C1',
        categoryId: 'K1',
        nameEn: 'Oak door',
        nameAr: 'باب بلوط',
        sortOrder: 1,
        isActive: true,
      },
    ]);
    service.catalogItems('K1').subscribe();
    http.expectNone(url('/crm/catalog/categories/K1/items'));
  });

  it('GET /employees/{id} (403/404 handled) → fullName, null on failure', () => {
    let name: string | null = 'x';
    service.employeeName('E1').subscribe((n) => (name = n));
    const req = http.expectOne(url('/employees/E1'));
    expect(req.request.context.get(HANDLED_ERROR_STATUSES)).toEqual([403, 404]);
    req.flush({ errors: { 'http.Forbidden': ['no'] } }, { status: 403, statusText: 'Forbidden' });
    expect(name).toBeNull();
    service.employeeName('E2').subscribe((n) => (name = n));
    http.expectOne(url('/employees/E2')).flush({ id: 'E2', fullName: 'Youssef Kamal' });
    expect(name).toBe('Youssef Kamal');
  });

  it('S-9: GET /projects/{p}/documents (403/404 handled) → id + file name', () => {
    let rows: unknown;
    service.projectDocuments('P').subscribe((r) => (rows = r));
    const req = http.expectOne(url('/projects/P/documents'));
    expect(req.request.method).toBe('GET');
    expect(req.request.context.get(HANDLED_ERROR_STATUSES)).toEqual([403, 404]);
    req.flush([{ id: 'D1', fileName: 'hall.jpg', contentType: 'image/jpeg', fileSizeBytes: 10 }]);
    expect(rows).toEqual([
      { id: 'D1', fileName: 'hall.jpg', contentType: 'image/jpeg', sizeBytes: 10 },
    ]);
  });

  it('S-9: POST /projects/{p}/documents multipart (part "file", errors handled) → documentId', () => {
    let id: unknown;
    const file = new File(['x'], 'hall.jpg', { type: 'image/jpeg' });
    service.uploadDocument('P', file).subscribe((r) => (id = r));
    const req = http.expectOne(url('/projects/P/documents'));
    expect(req.request.method).toBe('POST');
    expect(req.request.body instanceof FormData).toBe(true);
    expect((req.request.body as FormData).get('file')).toBe(file);
    expect(req.request.context.get(HANDLED_ERROR_STATUSES)).toEqual([400, 403, 404, 409, 413]);
    req.flush({ documentId: 'D9' });
    expect(id).toBe('D9');
  });
});

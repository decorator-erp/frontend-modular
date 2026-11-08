import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { environment } from '../../../../environments/environment';
import { HANDLED_ERROR_STATUSES } from '@platform/http/handled-errors';
import { EMPTY_UNIT_DATA } from '../model/site.model';
import { SiteService } from './site.service';

// sites S-1: R1–R20, dms Sites.Infrastructure/Endpoints/SiteEndpoints.cs.
describe('SiteService (sites S-1)', () => {
  let service: SiteService;
  let http: HttpTestingController;
  const url = (path: string) => `${environment.apiUrl}${path}`;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [SiteService, provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(SiteService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('R1 GET /sites?projectId&status&pageIndex&pageSize (never pageNumber) → a normalized page', () => {
    let page: unknown;
    service
      .list({ projectId: 'P', status: 2, pageIndex: 3, pageSize: 25 })
      .subscribe((p) => (page = p));
    const req = http.expectOne((r) => r.url === url('/sites'));
    expect(req.request.method).toBe('GET');
    expect(req.request.params.get('projectId')).toBe('P');
    expect(req.request.params.get('status')).toBe('2');
    expect(req.request.params.get('pageIndex')).toBe('3');
    expect(req.request.params.get('pageSize')).toBe('25');
    expect(req.request.params.has('pageNumber')).toBe(false);
    req.flush({
      items: [
        {
          id: 'S1',
          code: 'SITE-00001',
          status: 2,
          address: null,
          surveyedOn: '2026-11-01',
          createdAtUtc: '2026-11-01T08:00:00Z',
        },
      ],
      pageNumber: 3,
      pageSize: 25,
      totalCount: 51,
      totalPages: 3,
    });
    expect(page).toEqual({
      items: [
        {
          id: 'S1',
          code: 'SITE-00001',
          status: 2,
          address: null,
          surveyedOn: '2026-11-01',
          createdAtUtc: '2026-11-01T08:00:00Z',
        },
      ],
      pageNumber: 3,
      pageSize: 25,
      totalCount: 51,
      totalPages: 3,
    });
  });

  it('R1 omits status when absent and defaults pageIndex 1, pageSize 25', () => {
    service.list({ projectId: 'P' }).subscribe();
    const req = http.expectOne((r) => r.url === url('/sites'));
    expect(req.request.params.has('status')).toBe(false);
    expect(req.request.params.get('pageIndex')).toBe('1');
    expect(req.request.params.get('pageSize')).toBe('25');
    req.flush({ items: [], pageNumber: 1, pageSize: 25, totalCount: 0, totalPages: 0 });
  });

  it('R2 POST /sites {projectId, data} → 201 { siteId } unwrapped', () => {
    let id = '';
    const data = { ...EMPTY_UNIT_DATA, address: 'A', unitType: 1 as const };
    service.create('P', data).subscribe((x) => (id = x));
    const req = http.expectOne(url('/sites'));
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ projectId: 'P', data });
    expect(req.request.context.get(HANDLED_ERROR_STATUSES)).toEqual([400, 403, 404, 409]);
    req.flush({ siteId: 'S9' }, { status: 201, statusText: 'Created' });
    expect(id).toBe('S9');
  });

  it('R3 GET /sites/{id} → SiteDetail with int enums, 404 handled', () => {
    let detail: unknown;
    service.getById('S1').subscribe((d) => (detail = d));
    const req = http.expectOne(url('/sites/S1'));
    expect(req.request.method).toBe('GET');
    expect(req.request.context.get(HANDLED_ERROR_STATUSES)).toEqual([404]);
    req.flush({
      id: 'S1',
      projectId: 'P',
      code: 'SITE-00001',
      status: 'Submitted',
      address: 'Addr',
      unitType: 2,
      unitCondition: 1,
      areaSqm: 120.5,
      floorNo: -1,
      unitsPerFloor: 4,
      buildingKind: 1,
      position: 2,
      elevatorStatus: 3,
      isLicensed: true,
      isRented: false,
      utilityMetersNote: null,
      surveyedOn: '2026-11-02',
      notes: null,
      createdById: 'E1',
      submittedAtUtc: '2026-11-03T10:00:00Z',
      decidedAtUtc: null,
      decidedById: null,
      decisionNote: null,
      isActive: true,
      createdAtUtc: '2026-11-01T10:00:00Z',
      recordCounts: [{ moduleId: 'M1', code: 'DOORS', recordCount: 5 }],
    });
    expect(detail).toMatchObject({
      status: 2,
      unitType: 2,
      elevatorStatus: 3,
      areaSqm: 120.5,
      floorNo: -1,
      isRented: false,
      recordCounts: [{ moduleId: 'M1', code: 'DOORS', recordCount: 5 }],
    });
  });

  it('R4 PUT /sites/{id} { data } (full replace)', () => {
    service.update('S1', EMPTY_UNIT_DATA).subscribe();
    const req = http.expectOne(url('/sites/S1'));
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({ data: EMPTY_UNIT_DATA });
    req.flush(null, { status: 204, statusText: 'No Content' });
  });

  it('R5 DELETE /sites/{id}', () => {
    service.remove('S1').subscribe();
    const req = http.expectOne(url('/sites/S1'));
    expect(req.request.method).toBe('DELETE');
    req.flush(null, { status: 204, statusText: 'No Content' });
  });

  it.each([
    ['R6 submit', 'submit', '/sites/S1/submit'],
    ['R8 reopen', 'reopen', '/sites/S1/reopen'],
  ] as const)('%s → POST %s, no body', (_n, method, path) => {
    service[method]('S1').subscribe();
    const req = http.expectOne(url(path));
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toBeNull();
    expect(req.request.context.get(HANDLED_ERROR_STATUSES)).toEqual([400, 403, 404, 409]);
    req.flush(null, { status: 204, statusText: 'No Content' });
  });

  it('R7 POST /sites/{id}/approve { approved, note } (empty note → null)', () => {
    service.decide('S1', false, 'Redo the doors').subscribe();
    let req = http.expectOne(url('/sites/S1/approve'));
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ approved: false, note: 'Redo the doors' });
    req.flush(null, { status: 204, statusText: 'No Content' });
    service.decide('S1', true, '').subscribe();
    req = http.expectOne(url('/sites/S1/approve'));
    expect(req.request.body).toEqual({ approved: true, note: null });
    expect(req.request.context.get(HANDLED_ERROR_STATUSES)).toContain(403);
    req.flush(null, { status: 204, statusText: 'No Content' });
  });

  it('R9 GET /sites/{id}/records?moduleId → pivot with columns (hidden kept) and cells', () => {
    let pivot: unknown;
    service.pivot('S1', 'M1').subscribe((p) => (pivot = p));
    const req = http.expectOne((r) => r.url === url('/sites/S1/records'));
    expect(req.request.method).toBe('GET');
    expect(req.request.params.get('moduleId')).toBe('M1');
    req.flush({
      siteId: 'S1',
      moduleId: 'M1',
      moduleCode: 'DOORS',
      columns: [
        {
          linkId: 'L1',
          itemId: 'I1',
          code: 'width_cm',
          nameEn: 'Width',
          nameAr: 'العرض',
          dataType: 1,
          unit: 'cm',
          minValue: 10,
          maxValue: 400,
          tolerance: 2,
          maxLength: null,
          regexPattern: null,
          isRequired: true,
          isVisible: false,
          sortOrder: 1,
          options: [],
        },
      ],
      rows: [
        {
          recordId: 'R1',
          label: 'D-01',
          spaceId: null,
          spaceName: null,
          sortOrder: 1,
          note: null,
          cells: { width_cm: { valueNumber: 90 }, other: null },
        },
      ],
    });
    expect(pivot).toMatchObject({
      columns: [{ code: 'width_cm', dataType: 1, isVisible: false, isRequired: true }],
      rows: [
        { recordId: 'R1', cells: { width_cm: { valueNumber: 90, optionId: null }, other: null } },
      ],
    });
  });

  it('R10 POST /sites/{id}/records → 201 { recordId }', () => {
    let id = '';
    service.addRecord('S1', { moduleId: 'M1', label: 'D-01' }).subscribe((x) => (id = x));
    const req = http.expectOne(url('/sites/S1/records'));
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({
      moduleId: 'M1',
      label: 'D-01',
      spaceId: null,
      catalogItemId: null,
      sortOrder: 0,
      note: null,
    });
    req.flush({ recordId: 'R9' }, { status: 201, statusText: 'Created' });
    expect(id).toBe('R9');
  });

  it('R11 POST /sites/{id}/records/bulk { records }', () => {
    const records = [
      {
        recordId: null,
        moduleId: 'M1',
        label: 'D-01',
        spaceId: null,
        catalogItemId: null,
        sortOrder: 1,
        note: null,
        values: [{ itemId: 'I1', valueNumber: 90 }],
      },
    ];
    service.bulkSave('S1', records).subscribe();
    const req = http.expectOne(url('/sites/S1/records/bulk'));
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ records });
    req.flush(null, { status: 204, statusText: 'No Content' });
  });

  it('R12 GET /sites/{id}/records/grouped', () => {
    let g: unknown;
    service.grouped('S1').subscribe((x) => (g = x));
    const req = http.expectOne(url('/sites/S1/records/grouped'));
    expect(req.request.method).toBe('GET');
    req.flush({
      siteId: 'S1',
      groups: [
        {
          spaceId: null,
          spaceName: 'Whole unit',
          records: [
            {
              id: 'R1',
              moduleId: 'M1',
              label: 'D-01',
              spaceId: null,
              spaceName: null,
              catalogItemId: 'C1',
              sortOrder: 1,
              note: null,
            },
          ],
        },
      ],
    });
    expect(g).toMatchObject({ groups: [{ spaceId: null, records: [{ catalogItemId: 'C1' }] }] });
  });

  it('R13 PUT /sites/{id}/records/{rid}', () => {
    const body = { label: 'X', spaceId: null, catalogItemId: null, sortOrder: 2, note: null };
    service.updateRecord('S1', 'R1', body).subscribe();
    const req = http.expectOne(url('/sites/S1/records/R1'));
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual(body);
    req.flush(null, { status: 204, statusText: 'No Content' });
  });

  it('R14 DELETE /sites/{id}/records/{rid}', () => {
    service.deleteRecord('S1', 'R1').subscribe();
    const req = http.expectOne(url('/sites/S1/records/R1'));
    expect(req.request.method).toBe('DELETE');
    req.flush(null, { status: 204, statusText: 'No Content' });
  });

  it('R15 PUT /sites/{id}/records/{rid}/values { values }', () => {
    service.setValues('S1', 'R1', [{ itemId: 'I1', valueBool: true }]).subscribe();
    const req = http.expectOne(url('/sites/S1/records/R1/values'));
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({ values: [{ itemId: 'I1', valueBool: true }] });
    req.flush(null, { status: 204, statusText: 'No Content' });
  });

  it('R16 GET /sites/{id}/families?moduleId&groupBy (400 handled)', () => {
    let f: unknown;
    service.families('S1', 'M1', 'width_cm,height_cm').subscribe((x) => (f = x));
    const req = http.expectOne((r) => r.url === url('/sites/S1/families'));
    expect(req.request.params.get('moduleId')).toBe('M1');
    expect(req.request.params.get('groupBy')).toBe('width_cm,height_cm');
    expect(req.request.context.get(HANDLED_ERROR_STATUSES)).toEqual([400, 404]);
    req.flush({
      siteId: 'S1',
      moduleId: 'M1',
      groupBy: ['width_cm', 'height_cm'],
      families: [{ familyKey: 'k', instances: 2, spaceCount: 1, members: ['D-01', 'D-02'] }],
    });
    expect(f).toMatchObject({ groupBy: ['width_cm', 'height_cm'], families: [{ instances: 2 }] });
    service.families('S1', 'M1').subscribe();
    const bare = http.expectOne((r) => r.url === url('/sites/S1/families'));
    expect(bare.request.params.has('groupBy')).toBe(false);
    bare.flush({ siteId: 'S1', moduleId: 'M1', groupBy: [], families: [] });
  });

  it('R17 GET /sites/{id}/boq', () => {
    let b: unknown;
    service.boq('S1').subscribe((x) => (b = x));
    const req = http.expectOne(url('/sites/S1/boq'));
    req.flush({
      siteId: 'S1',
      lines: [
        {
          moduleCode: 'DOORS',
          kindCode: 'single',
          nameEn: 'Single',
          nameAr: 'مفرد',
          occurrences: 3,
          spaces: 2,
          totalQty: 3,
          totalAreaSqm: null,
          totalLengthM: null,
        },
      ],
    });
    expect(b).toMatchObject({ lines: [{ kindCode: 'single', totalAreaSqm: null }] });
  });

  it('R18 GET /sites/{id}/documents → plain array, kind int', () => {
    let d: unknown;
    service.documents('S1').subscribe((x) => (d = x));
    http.expectOne(url('/sites/S1/documents')).flush([
      {
        id: 'L1',
        documentId: 'D1',
        siteId: 'S1',
        recordId: null,
        kind: 'Sketch',
        addedById: 'E1',
        createdAtUtc: '2026-11-01T00:00:00Z',
      },
    ]);
    expect(d).toEqual([
      {
        id: 'L1',
        documentId: 'D1',
        siteId: 'S1',
        recordId: null,
        kind: 1,
        addedById: 'E1',
        createdAtUtc: '2026-11-01T00:00:00Z',
      },
    ]);
  });

  it('R19 POST /sites/{id}/documents → 201 { documentLinkId }', () => {
    let id = '';
    service.linkDocument('S1', { documentId: 'D1', kind: 3 }).subscribe((x) => (id = x));
    const req = http.expectOne(url('/sites/S1/documents'));
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ documentId: 'D1', kind: 3, recordId: null });
    req.flush({ documentLinkId: 'DL1' }, { status: 201, statusText: 'Created' });
    expect(id).toBe('DL1');
  });

  it('R20 DELETE /sites/{id}/documents/{linkId}', () => {
    service.unlinkDocument('S1', 'DL1').subscribe();
    const req = http.expectOne(url('/sites/S1/documents/DL1'));
    expect(req.request.method).toBe('DELETE');
    req.flush(null, { status: 204, statusText: 'No Content' });
  });
});

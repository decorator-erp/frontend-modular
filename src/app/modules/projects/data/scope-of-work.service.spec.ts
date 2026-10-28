import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { HANDLED_ERROR_STATUSES } from '@platform/http/handled-errors';
import { ScopeOfWorkService } from './scope-of-work.service';
import {
  ConfirmScopeOfWorkResponse,
  ScopeOfWork,
  ScopeOfWorkItem,
  ScopeOfWorkStatus,
} from '../model/scope-of-work.model';

/** sow #1: the eight routes of CRM-API-CONTRACT §2.16 (ScopeOfWorkEndpoints.cs:25-94). */
describe('ScopeOfWorkService (sow #1)', () => {
  let service: ScopeOfWorkService;
  let http: HttpTestingController;
  const BASE = '/api/projects/p1/scope-of-work';

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [ScopeOfWorkService, provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(ScopeOfWorkService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  const wireItem = {
    id: 'i1',
    sourceStageId: 's1',
    sourceTemplateName: 'Residential',
    name: 'Concept design',
    description: 'Mood boards',
    order: 1,
    fee: 25000.5,
    createdStageId: null,
    sourceMissing: false,
  };

  it('route 95 getScope: GET …/scope-of-work and types the ScopeOfWorkResponse', () => {
    let scope: ScopeOfWork | undefined;
    service.getScope('p1').subscribe((r) => (scope = r));
    const req = http.expectOne((r) => r.method === 'GET' && r.url === BASE);
    req.flush({
      id: 'sow1',
      projectId: 'p1',
      status: 2,
      durationDays: 120,
      plannedStartDate: '2026-11-01',
      estimatedEndDate: '2027-03-01',
      subtotal: 25000.5,
      adjustmentAmount: -500,
      adjustmentNote: 'Early payment',
      total: 24500.5,
      notes: 'n',
      confirmedAtUtc: '2026-10-27T10:00:00Z',
      confirmedById: 'e1',
      items: [{ ...wireItem, createdStageId: 'st9' }],
      canConfirm: false,
      blockingReason: 'projects.scope.Confirmed',
    });
    expect(scope).toEqual<ScopeOfWork>({
      id: 'sow1',
      projectId: 'p1',
      status: ScopeOfWorkStatus.Confirmed,
      durationDays: 120,
      plannedStartDate: '2026-11-01',
      estimatedEndDate: '2027-03-01',
      subtotal: 25000.5,
      adjustmentAmount: -500,
      adjustmentNote: 'Early payment',
      total: 24500.5,
      notes: 'n',
      confirmedAtUtc: '2026-10-27T10:00:00Z',
      confirmedById: 'e1',
      items: [{ ...wireItem, createdStageId: 'st9' }],
      canConfirm: false,
      blockingReason: 'projects.scope.Confirmed',
    });
  });

  it('route 95 getScope: an unsaved scope (id null) reads as an empty Draft', () => {
    let scope: ScopeOfWork | undefined;
    service.getScope('p1').subscribe((r) => (scope = r));
    http.expectOne(BASE).flush({
      id: null,
      projectId: 'p1',
      status: 1,
      durationDays: null,
      plannedStartDate: null,
      estimatedEndDate: null,
      subtotal: 0,
      adjustmentAmount: 0,
      adjustmentNote: null,
      total: 0,
      notes: null,
      confirmedAtUtc: null,
      confirmedById: null,
      items: [],
      canConfirm: false,
      blockingReason: 'projects.scope.Empty',
    });
    expect(scope?.id).toBeNull();
    expect(scope?.status).toBe(ScopeOfWorkStatus.Draft);
    expect(scope?.items).toEqual([]);
    expect(scope?.durationDays).toBeNull();
  });

  it('route 96 updateHeader: PUT …/scope-of-work with all five header fields', () => {
    let done = false;
    service
      .updateHeader('p1', {
        durationDays: 90,
        plannedStartDate: '2026-11-01',
        adjustmentAmount: 0,
        adjustmentNote: null,
        notes: null,
      })
      .subscribe(() => (done = true));
    const req = http.expectOne((r) => r.method === 'PUT' && r.url === BASE);
    expect(req.request.body).toEqual({
      durationDays: 90,
      plannedStartDate: '2026-11-01',
      adjustmentAmount: 0,
      adjustmentNote: null,
      notes: null,
    });
    req.flush(null, { status: 204, statusText: 'No Content' });
    expect(done).toBe(true);
  });

  it('route 97 addItems: POST …/items { sourceStageIds } and types the 200 items', () => {
    let items: ScopeOfWorkItem[] | undefined;
    service.addItems('p1', ['s1', 's2']).subscribe((r) => (items = r));
    const req = http.expectOne((r) => r.method === 'POST' && r.url === `${BASE}/items`);
    expect(req.request.body).toEqual({ sourceStageIds: ['s1', 's2'] });
    req.flush([wireItem]);
    expect(items).toEqual([wireItem]);
  });

  it('route 98 addFromTemplate: POST …/items/from-template/{id} with no body; [] is a no-op', () => {
    let items: ScopeOfWorkItem[] | undefined;
    service.addFromTemplate('p1', 't1').subscribe((r) => (items = r));
    const req = http.expectOne(
      (r) => r.method === 'POST' && r.url === `${BASE}/items/from-template/t1`,
    );
    expect(req.request.body).toBeNull();
    req.flush([]);
    expect(items).toEqual([]);
  });

  it('route 99 reorder: PUT …/items/order { itemIds } with the full order', () => {
    service.reorder('p1', ['i2', 'i1', 'i3']).subscribe();
    const req = http.expectOne((r) => r.method === 'PUT' && r.url === `${BASE}/items/order`);
    expect(req.request.body).toEqual({ itemIds: ['i2', 'i1', 'i3'] });
    req.flush(null, { status: 204, statusText: 'No Content' });
  });

  it('route 100 updateItem: PUT …/items/{itemId} { name, description, fee }', () => {
    service.updateItem('p1', 'i1', { name: 'Concept', description: 'Mood', fee: 100 }).subscribe();
    const req = http.expectOne((r) => r.method === 'PUT' && r.url === `${BASE}/items/i1`);
    expect(req.request.body).toEqual({ name: 'Concept', description: 'Mood', fee: 100 });
    req.flush(null, { status: 204, statusText: 'No Content' });
  });

  it('route 101 removeItem: DELETE …/items/{itemId}', () => {
    service.removeItem('p1', 'i1').subscribe();
    const req = http.expectOne((r) => r.method === 'DELETE' && r.url === `${BASE}/items/i1`);
    expect(req.request.body).toBeNull();
    req.flush(null, { status: 204, statusText: 'No Content' });
  });

  it('route 102 confirm: POST …/confirm, marks 403 handled, types { createdStageIds }', () => {
    let res: ConfirmScopeOfWorkResponse | undefined;
    service.confirm('p1').subscribe((r) => (res = r));
    const req = http.expectOne((r) => r.method === 'POST' && r.url === `${BASE}/confirm`);
    expect(req.request.body).toBeNull();
    expect(req.request.context.get(HANDLED_ERROR_STATUSES)).toEqual([403]);
    req.flush({ createdStageIds: ['st1', 'st2'] });
    expect(res).toEqual({ createdStageIds: ['st1', 'st2'] });
  });
});

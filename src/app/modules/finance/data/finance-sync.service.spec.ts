import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { environment } from '../../../../environments/environment';
import { LedgerEntryService } from './ledger-entry.service';
import { InvoiceService } from './invoice.service';
import { BudgetLineService, budgetLineLabel } from './budget-line.service';
import { VariationService } from './variation.service';
import type { BudgetLineResponse } from '../model/budget-line.model';
import type { LedgerEntryResponse } from '../model/ledger-entry.model';

/** Sync run — finance data layer against dms Finance.Infrastructure/Endpoints. */
describe('finance data — sync contract', () => {
  let http: HttpTestingController;
  const api = environment.apiUrl;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('W1-10: the ledger filter sends projectStageId / projectTaskId (LedgerEntryEndpoints.cs:86)', () => {
    TestBed.inject(LedgerEntryService)
      .getByProject('P1', { stageId: 'S1', taskId: 'T1' })
      .subscribe();
    const req = http.expectOne((r) => r.url === `${api}/ledger-entries/by-project/P1`);
    expect(req.request.params.get('projectStageId')).toBe('S1');
    expect(req.request.params.get('projectTaskId')).toBe('T1');
    expect(req.request.params.has('stageId')).toBe(false);
    expect(req.request.params.has('taskId')).toBe(false);
    req.flush({ items: [], pageNumber: 1, pageSize: 20, totalCount: 0 });
  });

  it('W2-6 (S7): ledger list rows read isReversed and note (absent → false / null)', () => {
    let rows: LedgerEntryResponse[] = [];
    TestBed.inject(LedgerEntryService)
      .getByProject('P1')
      .subscribe((p) => (rows = p.items));
    http
      .expectOne((r) => r.url === `${api}/ledger-entries/by-project/P1`)
      .flush({
        items: [
          { id: 'L1', amount: 100, isReversed: true, note: 'Wrong vendor' },
          { id: 'L2', amount: 50 },
        ],
        pageNumber: 1,
        pageSize: 20,
        totalCount: 2,
      });
    expect(rows.map((r) => [r.id, r.isReversed, r.note])).toEqual([
      ['L1', true, 'Wrong vendor'],
      ['L2', false, null],
    ]);
  });

  it('W1-11: reads the unallocated remainders (LedgerEntryEndpoints.cs:109)', () => {
    let m = new Map<string, string>();
    TestBed.inject(LedgerEntryService)
      .getUnallocated('P1')
      .subscribe((r) => (m = r));
    http
      .expectOne((r) => r.url === `${api}/ledger-entries/by-project/P1/unallocated`)
      .flush({
        items: [
          { id: 'L1', amount: 100, unallocatedAmount: 40 },
          { id: 'L2', amount: 50, unallocatedAmount: 0 },
        ],
        pageNumber: 1,
        pageSize: 200,
        totalCount: 2,
      });
    expect([...m.entries()]).toEqual([['L1', '40']]);
  });

  it('W1-11: outstanding invoices are GET /invoices/by-project/{id}/outstanding', () => {
    TestBed.inject(InvoiceService).getOutstanding('P1').subscribe();
    http.expectOne(`${api}/invoices/by-project/P1/outstanding`).flush([]);
  });

  it('W1-11: the invoice list sends no type filter (the route has none)', () => {
    TestBed.inject(InvoiceService).getByProject('P1', { pageSize: 10 }).subscribe();
    const req = http.expectOne((r) => r.url === `${api}/invoices/by-project/P1`);
    expect(req.request.params.has('type')).toBe(false);
    req.flush({ items: [] });
  });

  it('W1-11: budget-line recalculate is a PUT (BudgetLineEndpoints.cs:70)', () => {
    TestBed.inject(BudgetLineService).recalculate('B1').subscribe();
    const req = http.expectOne(`${api}/budget-lines/B1/recalculate`);
    expect(req.request.method).toBe('PUT');
    req.flush(null);
  });

  it('W2-1 (S5): reads costCategoryName and makes no category read when every line has one', () => {
    let lines: BudgetLineResponse[] = [];
    TestBed.inject(BudgetLineService)
      .getByProject('P1')
      .subscribe((l) => (lines = l));
    http
      .expectOne(`${api}/budget-lines/by-project/P1`)
      .flush([{ id: 'B1', name: 'Tiles', costCategoryId: 'C1', costCategoryName: 'Finishes' }]);
    http.expectNone((r) => r.url === `${api}/cost-categories`);
    expect(lines[0].costCategoryName).toBe('Finishes');
    expect(budgetLineLabel(lines[0])).toBe('Finishes — Tiles');
  });

  it('W2-1: a line without the name joins it from the cost categories; never "undefined"', () => {
    let lines: BudgetLineResponse[] = [];
    TestBed.inject(BudgetLineService)
      .getByProject('P1')
      .subscribe((l) => (lines = l));
    http.expectOne(`${api}/budget-lines/by-project/P1`).flush([
      { id: 'B1', name: 'Tiles', costCategoryId: 'C1' },
      { id: 'B2', name: 'Misc', costCategoryId: 'C9', costCategoryName: null },
    ]);
    http
      .expectOne((r) => r.url === `${api}/cost-categories`)
      .flush({ items: [{ id: 'C1', name: 'Finishes' }], pageNumber: 1, totalCount: 1 });
    expect(lines.map(budgetLineLabel)).toEqual(['Finishes — Tiles', 'Misc']);
  });

  it('W1-7: sign sends { signedByClientId, signedDocumentPath } (VariationMessages.cs:29)', () => {
    TestBed.inject(VariationService)
      .sign('V1', { signedByClientId: 'C1', signedDocumentPath: 'project-documents/D1' })
      .subscribe();
    const req = http.expectOne(`${api}/variations/V1/sign`);
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({
      signedByClientId: 'C1',
      signedDocumentPath: 'project-documents/D1',
    });
    req.flush(null);
  });

  it('W1-8 (S4): the description save is PUT /variations/{id}/description { description }', () => {
    TestBed.inject(VariationService)
      .setDescription('V1', { description: 'Marble upgrade' })
      .subscribe();
    const req = http.expectOne(`${api}/variations/V1/description`);
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({ description: 'Marble upgrade' });
    req.flush(null);
  });
});

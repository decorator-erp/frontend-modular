import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastService } from '@platform/feedback/toast.service';
import { SiteDefinitionService } from '../data/site-definition.service';
import { SiteLookupService } from '../data/site-lookup.service';
import { SiteService } from '../data/site.service';
import { FIELDS, KIND, SECRET, WIDTH, cell, pivotRow } from '../testing/site-fixtures';
import { SiteCaptureStore } from './site-capture.store';

const MODULE = {
  id: 'M1',
  code: 'DOORS',
  nameEn: 'Doors',
  nameAr: 'أبواب',
  descriptionEn: null,
  descriptionAr: null,
  isSystem: false,
  sortOrder: 1,
  isActive: true,
};
const problem = (status: number, errors: Record<string, string[]>) =>
  new HttpErrorResponse({ status, error: { errors } });

describe('SiteCaptureStore (sites S-5)', () => {
  let api: Record<string, ReturnType<typeof vi.fn>>;
  let lookup: Record<string, ReturnType<typeof vi.fn>>;
  let calls: string[];

  function make() {
    TestBed.configureTestingModule({
      providers: [
        SiteCaptureStore,
        { provide: SiteService, useValue: api },
        {
          provide: SiteDefinitionService,
          useValue: { schema: vi.fn(() => of({ moduleId: 'M1', code: 'DOORS', fields: FIELDS })) },
        },
        { provide: SiteLookupService, useValue: lookup },
        { provide: ToastService, useValue: { show: vi.fn() } },
      ],
    });
    const store = TestBed.inject(SiteCaptureStore);
    store.open('S1', 'P', MODULE);
    return store;
  }

  beforeEach(() => {
    calls = [];
    api = {
      pivot: vi.fn(() =>
        of({
          siteId: 'S1',
          moduleId: 'M1',
          moduleCode: 'DOORS',
          columns: FIELDS,
          rows: [
            pivotRow({
              recordId: 'R1',
              label: 'DO-01',
              cells: { width_cm: cell({ valueNumber: 90 }), secret: cell({ valueText: 'kept' }) },
            }),
            pivotRow({
              recordId: 'R2',
              label: 'DO-02',
              cells: { width_cm: cell({ valueNumber: 80 }) },
            }),
          ],
        }),
      ),
      grouped: vi.fn(() =>
        of({
          siteId: 'S1',
          groups: [
            {
              spaceId: null,
              spaceName: 'Whole unit',
              records: [{ id: 'R1', catalogItemId: null }],
            },
          ],
        }),
      ),
      deleteRecord: vi.fn((_s: string, id: string) => {
        calls.push(`DELETE ${id}`);
        return of(undefined);
      }),
      bulkSave: vi.fn(() => {
        calls.push('POST bulk');
        return of(undefined);
      }),
    };
    lookup = {
      spaces: vi.fn(() => of([{ id: 'SP1', name: 'Hall', sortOrder: 1, isActive: true }])),
      catalogCategories: vi.fn(() => of([])),
      allCatalogItems: vi.fn(() => of([])),
    };
  });

  it('loads D2 schema by module code + R9 pivot + R12 grouped; columns = visible fields', () => {
    const store = make();
    expect(store.visible().map((f) => f.code)).toEqual(['width_cm', 'kind']);
    expect(store.hidden().map((f) => f.code)).toEqual(['secret', 'finish']);
    expect(api['pivot']).toHaveBeenCalledWith('S1', 'M1');
  });

  it('save order: DELETE each removed stored row first, then ONE bulk POST of every row', async () => {
    const store = make();
    store.startEdit();
    const [r1, r2] = store.draft()!;
    store.remove(r2.key);
    store.addRow();
    store.setValue(store.draft()![1].key, WIDTH.itemId, 100);
    expect(await store.save()).toBe(true);
    expect(calls).toEqual(['DELETE R2', 'POST bulk']);
    const body = api['bulkSave'].mock.calls[0][1];
    expect(body).toHaveLength(2);
    expect(body[0]).toMatchObject({ recordId: 'R1', moduleId: 'M1', sortOrder: 1 });
    expect(body[1]).toMatchObject({ recordId: null, moduleId: 'M1', sortOrder: 2, label: 'DO-02' });
    // DEVIATION-17: R1's hidden value is resent; nothing is sent for a hidden field it never had
    expect(body[0].values).toContainEqual({ itemId: SECRET.itemId, valueText: 'kept' });
    expect(body[1].values).toEqual([{ itemId: WIDTH.itemId, valueNumber: 100 }]);
    expect(store.draft()).toBeNull();
    expect(r1.recordId).toBe('R1');
  });

  it('a delete that fails partway: the retry re-sends only the deletes not yet done (A1)', async () => {
    let fail = true;
    api['deleteRecord'].mockImplementation((_s: string, id: string) => {
      calls.push(`DELETE ${id}`);
      if (id === 'R2' && fail) return throwError(() => problem(409, { 'sites.SiteLocked': ['x'] }));
      return of(undefined);
    });
    const store = make();
    store.startEdit();
    const [r1, r2] = store.draft()!;
    store.remove(r1.key);
    store.remove(r2.key);
    store.addRow();
    store.setValue(store.draft()![0].key, WIDTH.itemId, 100);
    expect(await store.save()).toBe(false);
    expect(calls).toEqual(['DELETE R1', 'DELETE R2']);
    expect(store.removed()).toEqual(['R2']);
    fail = false;
    calls = [];
    expect(await store.save()).toBe(true);
    expect(calls).toEqual(['DELETE R2', 'POST bulk']);
  });

  it('a queued delete answered 404 RecordNotFound counts as already deleted (A1)', async () => {
    api['deleteRecord'].mockImplementation((_s: string, id: string) => {
      calls.push(`DELETE ${id}`);
      return id === 'R1'
        ? throwError(() => problem(404, { 'sites.RecordNotFound': ['gone'] }))
        : of(undefined);
    });
    const store = make();
    store.startEdit();
    const [r1, r2] = store.draft()!;
    store.remove(r1.key);
    store.remove(r2.key);
    store.addRow();
    store.setValue(store.draft()![0].key, WIDTH.itemId, 100);
    expect(await store.save()).toBe(true);
    expect(calls).toEqual(['DELETE R1', 'DELETE R2', 'POST bulk']);
  });

  it('no request when the pre-check fails; label swap in one save passes', async () => {
    const store = make();
    store.startEdit();
    const [a, b] = store.draft()!;
    store.setValue(a.key, WIDTH.itemId, null); // required
    expect(await store.save()).toBe(false);
    expect(calls).toEqual([]);
    expect(store.cellErrors()[`${a.key}:${WIDTH.itemId}`]).toBeTruthy();
    expect(store.banner()).toBeTruthy();
    store.setValue(a.key, WIDTH.itemId, 50);
    store.setLabel(a.key, 'DO-02');
    store.setLabel(b.key, 'DO-01');
    expect(await store.save()).toBe(true);
    expect(calls).toEqual(['POST bulk']);
  });

  it('more than 500 rows is blocked before any request', async () => {
    const store = make();
    store.startEdit();
    for (let i = 0; i < 500; i++) store.addRow();
    expect(await store.save()).toBe(false);
    expect(calls).toEqual([]);
    expect(store.banner()).toBe('At most 500 rows per save.');
  });

  it('a refused bulk keeps the draft, re-reads the pivot and maps the error to its row', async () => {
    api['bulkSave'].mockReturnValue(
      throwError(() => problem(400, { 'sites.validation.width_cm.Max': ['too big'] })),
    );
    const store = make();
    store.startEdit();
    const [, b] = store.draft()!;
    // locally within 10..400 so the pre-check passes; the server's max differs (stale schema)
    store.setValue(b.key, WIDTH.itemId, 400);
    const pivotCalls = api['pivot'].mock.calls.length;
    expect(await store.save()).toBe(false);
    expect(store.draft()).not.toBeNull();
    expect(api['pivot'].mock.calls.length).toBe(pivotCalls + 1);
    expect(store.banner()).toContain('width_cm');
  });

  it('LabelTaken against a record saved meanwhile points at the colliding label', async () => {
    api['bulkSave'].mockReturnValue(
      throwError(() => problem(409, { 'sites.LabelTaken': ['taken'] })),
    );
    const store = make();
    store.startEdit();
    const [a] = store.draft()!;
    store.setLabel(a.key, 'DO-09');
    api['pivot'].mockReturnValue(
      of({
        siteId: 'S1',
        moduleId: 'M1',
        moduleCode: 'DOORS',
        columns: FIELDS,
        rows: [pivotRow({ recordId: 'R9', label: 'do-09' })],
      }),
    );
    await store.save();
    expect(store.cellErrors()[`${a.key}:label`]).toBeTruthy();
  });

  it('spaces 403 → only "Whole unit" with a reason (A1); catalog 403 → picker hidden', () => {
    lookup['spaces'].mockReturnValue(throwError(() => new HttpErrorResponse({ status: 403 })));
    lookup['allCatalogItems'].mockReturnValue(
      throwError(() => new HttpErrorResponse({ status: 403 })),
    );
    lookup['catalogCategories'].mockReturnValue(
      throwError(() => new HttpErrorResponse({ status: 403 })),
    );
    const store = make();
    store.startEdit();
    expect(store.spacesUnavailable()).toBe(true);
    expect(store.catalogUnavailable()).toBe(true);
    expect(store.spaces()).toBeNull();
  });

  it('a module made inactive since load → module-gone state', () => {
    api['pivot'].mockReturnValue(throwError(() => problem(404, { 'sites.ModuleNotFound': ['x'] })));
    const store = make();
    expect(store.moduleGone()).toBe(true);
  });

  it('duplicate inserts after the source with a new label and no record id', () => {
    const store = make();
    store.startEdit();
    const [a] = store.draft()!;
    store.duplicate(a.key);
    expect(store.draft()!.map((r) => [r.recordId, r.label])).toEqual([
      ['R1', 'DO-01'],
      [null, 'DO-03'],
      ['R2', 'DO-02'],
    ]);
    expect(KIND.itemId in store.draft()![1].values).toBe(true);
  });
});

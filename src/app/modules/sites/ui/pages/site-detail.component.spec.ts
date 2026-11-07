import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { BehaviorSubject, Observable, of, throwError } from 'rxjs';
import { HttpErrorResponse } from '@angular/common/http';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ConfirmService, ModalService } from '@ds';
import { ProjectAccessStore } from '@modules/projects';
import { ToastService } from '@platform/feedback/toast.service';
import { PermissionsService } from '@platform/permissions/permissions.service';
import { SiteDefinitionService } from '../../data/site-definition.service';
import { SiteLookupService } from '../../data/site-lookup.service';
import { SiteService } from '../../data/site.service';
import { FIELDS, cell, detail, pivotRow } from '../../testing/site-fixtures';
import type { SiteDetail } from '../../model/site.model';
import type { SiteDecideDialogData } from '../detail/site-decide-dialog.component';
import { SiteDetailComponent } from './site-detail.component';

interface DetailHarness {
  perms: Set<string>;
  project: ReturnType<typeof signal<unknown>>;
  me: string | null;
  site: SiteDetail;
  api: Record<string, ReturnType<typeof vi.fn>>;
  modalOpen: ReturnType<typeof vi.fn>;
  confirmOpen: ReturnType<typeof vi.fn>;
  query: BehaviorSubject<ReturnType<typeof convertToParamMap>>;
  spaces: Observable<unknown>;
  catalog: Observable<unknown>;
}

function harness(): DetailHarness {
  return {
    perms: new Set(['sites.read', 'sites.update', 'sites.submit', 'sites.approve', 'sites.delete']),
    project: signal<unknown>({
      id: 'P',
      code: 'PRJ-1',
      name: 'Villa',
      clientName: 'Karim',
      myLevel: 'Manager',
      status: 'InProgress',
      isActive: true,
    }),
    me: 'E-me',
    site: detail(),
    api: {},
    modalOpen: vi.fn(() => ({ afterClosed: () => Promise.resolve(undefined) })),
    confirmOpen: vi.fn(() => Promise.resolve(true)),
    query: new BehaviorSubject(convertToParamMap({})),
    spaces: of([{ id: 'SP1', name: 'Hall', sortOrder: 1, isActive: true }]),
    catalog: of([]),
  };
}

function renderDetail(h: DetailHarness, extra: unknown[] = []) {
  h.api = {
    getById: vi.fn(() => of(h.site)),
    update: vi.fn(() => of(undefined)),
    submit: vi.fn(() => of(undefined)),
    decide: vi.fn(() => of(undefined)),
    reopen: vi.fn(() => of(undefined)),
    remove: vi.fn(() => of(undefined)),
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
            spaceName: 'Hall',
            spaceId: 'SP1',
            cells: {
              width_cm: cell({ valueNumber: 90 }),
              kind: cell({ optionId: 'O-a', optionNameEn: 'Single', optionNameAr: 'مفرد' }),
              secret: cell({ valueText: 'TOP-SECRET' }),
            },
          }),
        ],
      }),
    ),
    grouped: vi.fn(() => of({ siteId: 'S1', groups: [] })),
    bulkSave: vi.fn(() => of(undefined)),
    deleteRecord: vi.fn(() => of(undefined)),
    ...h.api,
  };
  TestBed.configureTestingModule({
    imports: [SiteDetailComponent],
    providers: [
      provideRouter([]),
      {
        provide: ActivatedRoute,
        useValue: {
          paramMap: of(convertToParamMap({ siteId: 'S1' })),
          queryParamMap: h.query,
          snapshot: { queryParamMap: h.query.value },
        },
      },
      { provide: SiteService, useValue: h.api },
      {
        provide: SiteDefinitionService,
        useValue: {
          schema: () => of({ moduleId: 'M1', code: 'DOORS', fields: FIELDS }),
          modules: () =>
            of([
              {
                id: 'M1',
                code: 'DOORS',
                nameEn: 'Doors',
                nameAr: 'أبواب',
                sortOrder: 1,
                isActive: true,
              },
            ]),
        },
      },
      {
        provide: SiteLookupService,
        useValue: {
          employeeName: (id: string) => of(`Name ${id}`),
          spaces: () => h.spaces,
          catalogCategories: () => h.catalog,
          allCatalogItems: () => h.catalog,
        },
      },
      {
        provide: ProjectAccessStore,
        useValue: { ensure: vi.fn(), refresh: vi.fn(), project: () => h.project, me: () => h.me },
      },
      { provide: PermissionsService, useValue: { can: (p: string) => h.perms.has(p) } },
      { provide: ToastService, useValue: { show: vi.fn() } },
      { provide: ModalService, useValue: { open: h.modalOpen } },
      { provide: ConfirmService, useValue: { open: h.confirmOpen } },
      ...(extra as never[]),
    ],
  });
  const fixture = TestBed.createComponent(SiteDetailComponent);
  fixture.detectChanges();
  return { fixture, el: fixture.nativeElement as HTMLElement };
}

describe('SiteDetailComponent — overview (sites S-3)', () => {
  let h: DetailHarness;
  beforeEach(() => (h = harness()));

  it('renders the header, project link, level chip and the 14 unit facts with "—" for null', () => {
    h.site = detail({
      address: 'Maadi',
      areaSqm: 410,
      unitType: 2,
      isLicensed: true,
      recordCounts: [{ moduleId: 'M1', code: 'DOORS', recordCount: 5 }],
    });
    const { el } = renderDetail(h);
    expect(el.querySelector('h1')?.textContent).toContain('SITE-00001');
    expect(el.querySelector('[data-status]')?.textContent).toContain('Draft');
    expect(el.querySelector('[data-project-link]')?.textContent).toContain('PRJ-1 · Villa');
    expect(el.querySelector('[data-level-chip]')?.textContent).toContain('Manager');
    const facts = el.querySelector('[data-unit-facts]')!;
    expect(facts.querySelectorAll('dt')).toHaveLength(14);
    expect(facts.textContent).toContain('Maadi');
    expect(facts.textContent).toContain('Villa');
    expect(facts.textContent).toContain('410 m²');
    expect(facts.textContent).toContain('Yes');
    expect(facts.textContent).toContain('—');
    expect(el.querySelector('[data-record-counts]')?.textContent).toContain('5');
    expect(el.querySelector('[data-trail]')?.textContent).toContain('Created by Name E-creator');
    expect(el.querySelector('[data-access]')?.textContent).toContain('Manager');
  });

  it('Edit unit data: Editor on an editable survey of an open project; opens the edit modal', () => {
    let { el } = renderDetail(h);
    (el.querySelector('[data-act="edit"] button') as HTMLButtonElement).click();
    expect(h.modalOpen.mock.calls[0][1].data.mode).toBe('edit');
    TestBed.resetTestingModule();
    h.project.set({ myLevel: 'Viewer', status: 'InProgress', isActive: true });
    ({ el } = renderDetail(h));
    expect(el.querySelector('[data-act="edit"]')).toBeNull();
    expect(el.querySelector('[data-banner="viewer"]')).toBeTruthy();
    TestBed.resetTestingModule();
    h.project.set({ myLevel: 'Editor', status: 'OnHold', isActive: true });
    ({ el } = renderDetail(h));
    expect(el.querySelector('[data-act="edit"]')).toBeNull();
    expect(el.querySelector('[data-banner="closed"]')?.textContent).toContain('On hold');
  });

  it('approved / rejected banners carry the decider name and note', () => {
    h.site = detail({
      status: 3,
      decidedById: 'E-boss',
      decidedAtUtc: '2026-11-03T10:00:00Z',
      decisionNote: 'Good',
    });
    let { el } = renderDetail(h);
    expect(el.querySelector('[data-banner="approved"]')?.textContent).toContain('Name E-boss');
    expect(el.querySelector('[data-banner="approved"]')?.textContent).toContain('Good');
    TestBed.resetTestingModule();
    h.site = detail({
      status: 4,
      decidedById: 'E-boss',
      decidedAtUtc: '2026-11-03T10:00:00Z',
      decisionNote: 'Redo',
    });
    ({ el } = renderDetail(h));
    expect(el.querySelector('[data-banner="rejected"]')?.textContent).toContain('Redo');
  });

  it('404 → not-found state; other failure → error with retry', () => {
    h.api = { getById: vi.fn(() => throwError(() => new HttpErrorResponse({ status: 404 }))) };
    let { el } = renderDetail(h);
    expect(el.querySelector('[data-not-found]')).toBeTruthy();
    TestBed.resetTestingModule();
    h.api = { getById: vi.fn(() => throwError(() => new HttpErrorResponse({ status: 500 }))) };
    ({ el } = renderDetail(h));
    expect(el.querySelector('[data-detail-error]')).toBeTruthy();
  });

  it('a Draft without an address shows the address-needed warning', () => {
    const { el } = renderDetail(h);
    expect(el.querySelector('[data-address-needed]')).toBeTruthy();
  });
});

const problem = (status: number, code: string) =>
  new HttpErrorResponse({ status, error: { errors: { [code]: ['msg'] } } });
const flush = () => new Promise((r) => setTimeout(r));

const buttons = (el: HTMLElement) =>
  [...el.querySelectorAll('[data-act]')].map((b) => b.getAttribute('data-act')).sort();

describe('SiteDetailComponent — workflow (sites S-4)', () => {
  let h: DetailHarness;
  beforeEach(() => (h = harness()));

  const level = (myLevel: string, status = 'InProgress') =>
    h.project.set({
      id: 'P',
      code: 'PRJ-1',
      name: 'Villa',
      clientName: 'K',
      myLevel,
      status,
      isActive: true,
    });

  it.each([
    // [survey status, level, project status, expected buttons]
    [1, 'Viewer', 'InProgress', []],
    [1, 'Editor', 'InProgress', ['edit', 'submit']],
    [1, 'Manager', 'InProgress', ['delete', 'edit', 'more', 'submit']],
    [1, 'Manager', 'OnHold', []],
    [2, 'Editor', 'InProgress', []],
    [2, 'Manager', 'InProgress', ['approve', 'reject']],
    [2, 'Manager', 'Completed', ['approve', 'reject']],
    [3, 'Manager', 'InProgress', []],
    [4, 'Editor', 'InProgress', ['edit']],
    [4, 'Manager', 'InProgress', ['delete', 'edit', 'more', 'reopen']],
    [4, 'Manager', 'Cancelled', []],
  ] as const)('status %s at %s on a %s project → %j', (status, lvl, pstatus, expected) => {
    h.site = detail({ status });
    level(lvl, pstatus);
    const { fixture, el } = renderDetail(h);
    // the delete item lives inside the dropdown panel: open it to count it
    (el.querySelector('[data-act="more"]') as HTMLButtonElement | null)?.click();
    fixture.detectChanges();
    const inPanel = document.querySelector('[data-act="delete"]') ? ['delete'] : [];
    expect([...new Set([...buttons(el), ...inPanel])].sort()).toEqual([...expected].sort());
  });

  it('claims gate too: no sites.submit → no Submit; no sites.approve → no decision', () => {
    h.perms.delete('sites.submit');
    h.perms.delete('sites.delete');
    let { el } = renderDetail(h);
    expect(buttons(el)).toEqual(['edit']);
    TestBed.resetTestingModule();
    h.perms.delete('sites.approve');
    h.site = detail({ status: 2 });
    ({ el } = renderDetail(h));
    expect(buttons(el)).toEqual([]);
  });

  it('a closed project shows the read-only banner; a Submitted survey reads "can still be decided"', () => {
    level('Manager', 'OnHold');
    let { el } = renderDetail(h);
    expect(el.querySelector('[data-banner="closed"]')?.textContent).toContain(
      'Survey work is closed:',
    );
    TestBed.resetTestingModule();
    h.site = detail({ status: 2, submittedAtUtc: '2026-11-03T10:00:00Z' });
    ({ el } = renderDetail(h));
    expect(el.querySelector('[data-banner="closed"]')?.textContent).toContain(
      'can still be approved',
    );
    expect(el.querySelector('[data-banner="submitted"]')).toBeTruthy();
  });

  it('Submit: confirm → POST submit → reload', async () => {
    level('Editor');
    const { fixture, el } = renderDetail(h);
    (el.querySelector('[data-act="submit"] button') as HTMLButtonElement).click();
    await flush();
    expect(h.confirmOpen).toHaveBeenCalled();
    expect(h.api['submit']).toHaveBeenCalledWith('S1');
    expect(h.api['getById']).toHaveBeenCalledTimes(2);
    fixture.detectChanges();
  });

  it('Submit refused with AddressRequiredToSubmit points at the address', async () => {
    level('Editor');
    h.api = {
      submit: vi.fn(() => throwError(() => problem(400, 'sites.AddressRequiredToSubmit'))),
    };
    const { fixture, el } = renderDetail(h);
    (el.querySelector('[data-act="submit"] button') as HTMLButtonElement).click();
    await flush();
    fixture.detectChanges();
    expect(el.querySelector('[data-banner="action"]')).toBeTruthy();
    expect(el.querySelector('[data-unit-facts] dt.text-danger')?.textContent).toContain('Address');
  });

  it('the creator sees Reject but not Approve, with the reason (U5); project.read_all lifts it', () => {
    h.site = detail({ status: 2, createdById: 'E-me' });
    let { el } = renderDetail(h);
    expect(buttons(el)).toEqual(['reject']);
    expect(el.querySelector('[data-banner="self"]')).toBeTruthy();
    TestBed.resetTestingModule();
    h.perms.add('project.read_all');
    ({ el } = renderDetail(h));
    expect(buttons(el)).toEqual(['approve', 'reject']);
  });

  it('Approve opens the decide modal; its save posts approve with the note', async () => {
    h.site = detail({ status: 2 });
    const { el } = renderDetail(h);
    (el.querySelector('[data-act="approve"] button') as HTMLButtonElement).click();
    const data = h.modalOpen.mock.calls[0][1].data as SiteDecideDialogData;
    expect(data.approve).toBe(true);
    const outcome = await data.save('ok');
    expect(h.api['decide']).toHaveBeenCalledWith('S1', true, 'ok');
    expect(outcome.ok).toBe(true);
  });

  it('403 SelfApprovalNotAllowed: inline message and the decision buttons go away for the session', async () => {
    h.site = detail({ status: 2 });
    h.api = { decide: vi.fn(() => throwError(() => problem(403, 'sites.SelfApprovalNotAllowed'))) };
    const { fixture, el } = renderDetail(h);
    (el.querySelector('[data-act="reject"] button') as HTMLButtonElement).click();
    const data = h.modalOpen.mock.calls[0][1].data as SiteDecideDialogData;
    const outcome = await data.save(null);
    expect(outcome.code).toBe('sites.SelfApprovalNotAllowed');
    expect(outcome.message).toBeTruthy();
    fixture.detectChanges();
    expect(buttons(el)).toEqual([]);
    expect(el.querySelector('[data-banner="blocked"]')).toBeTruthy();
  });

  it('Reopen: confirm → POST reopen', async () => {
    h.site = detail({ status: 4 });
    const { el } = renderDetail(h);
    (el.querySelector('[data-act="reopen"] button') as HTMLButtonElement).click();
    await flush();
    expect(h.api['reopen']).toHaveBeenCalledWith('S1');
  });

  it('Delete via the more menu: danger confirm → DELETE → /sites', async () => {
    const { fixture, el } = renderDetail(h);
    const nav = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    (el.querySelector('[data-act="more"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    (document.querySelector('[data-act="delete"]') as HTMLButtonElement).click();
    await flush();
    expect(h.confirmOpen.mock.calls[0][0].tone).toBe('danger');
    expect(h.api['remove']).toHaveBeenCalledWith('S1');
    expect(nav).toHaveBeenCalledWith(['/sites'], { queryParams: { projectId: 'P' } });
  });
});

describe('SiteDetailComponent — capture grid (sites S-5)', () => {
  let h: DetailHarness;
  beforeEach(() => {
    h = harness();
    h.query.next(convertToParamMap({ tab: 'capture', m: 'M1' }));
    h.site = detail({ recordCounts: [{ moduleId: 'M1', code: 'DOORS', recordCount: 1 }] });
  });

  it('module sub-tabs with counts; columns are the visible fields only; "N hidden fields"', () => {
    const { el } = renderDetail(h);
    expect(el.querySelector('[data-module-tabs]')?.textContent).toContain('Doors 1');
    const read = el.querySelector('[data-grid="read"]')!;
    expect([...read.querySelectorAll('[data-col]')].map((c) => c.getAttribute('data-col'))).toEqual(
      ['width_cm', 'kind'],
    );
    expect(read.textContent).toContain('90 cm');
    expect(read.textContent).toContain('Single');
    expect(read.textContent).toContain('Hall');
    expect(read.textContent).not.toContain('TOP-SECRET');
    expect(el.querySelector('[data-card-sub]')?.textContent).toContain('2 hidden field(s)');
  });

  it('Edit grid only for an editor on an editable survey of an open project', () => {
    let { el } = renderDetail(h);
    expect(el.querySelector('[data-edit-grid]')).toBeTruthy();
    TestBed.resetTestingModule();
    h.site = detail({ status: 2, recordCounts: [] });
    ({ el } = renderDetail(h));
    expect(el.querySelector('[data-edit-grid]')).toBeNull();
  });

  it('edit view: typed editors, add/duplicate/remove, one save', async () => {
    const { fixture, el } = renderDetail(h);
    (el.querySelector('[data-edit-grid] button') as HTMLButtonElement).click();
    fixture.detectChanges();
    const grid = el.querySelector('[data-grid="edit"]')!;
    expect(grid.querySelectorAll('[data-row]')).toHaveLength(1);
    expect(grid.textContent).not.toContain('TOP-SECRET');
    (el.querySelector('[data-add-row] button') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(grid.querySelectorAll('[data-row]')).toHaveLength(2);
    (el.querySelector('[data-save] button') as HTMLButtonElement).click();
    await new Promise((r) => setTimeout(r));
    fixture.detectChanges();
    // the new row has no width (required) → pre-check blocks, inline error, nothing sent
    expect(h.api['bulkSave']).not.toHaveBeenCalled();
    expect(el.querySelector('[data-cell-error="width_cm"]')).toBeTruthy();
    expect(el.querySelector('[data-grid-banner]')).toBeTruthy();
  });

  it('spaces 403 → "Whole unit" only, with the reason (A1 / BF-1); catalog 403 → picker hidden', () => {
    h.spaces = throwError(() => new HttpErrorResponse({ status: 403 }));
    h.catalog = throwError(() => new HttpErrorResponse({ status: 403 }));
    const { fixture, el } = renderDetail(h);
    (el.querySelector('[data-edit-grid] button') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(el.querySelector('[data-spaces-unavailable]')).toBeTruthy();
    expect(el.querySelector('[data-catalog-unavailable]')).toBeTruthy();
    expect(el.querySelector('[data-cell="catalog"]')).toBeNull();
  });
});

describe('SiteDetailComponent — by space (sites S-6)', () => {
  let h: DetailHarness;
  beforeEach(() => {
    h = harness();
    h.query.next(convertToParamMap({ tab: 'spaces' }));
    h.site = detail({ recordCounts: [{ moduleId: 'M1', code: 'DOORS', recordCount: 2 }] });
  });

  const rec = (id: string, label: string, spaceId: string | null) => ({
    id,
    moduleId: 'M1',
    label,
    spaceId,
    spaceName: spaceId ? 'Hall' : null,
    catalogItemId: null,
    sortOrder: 1,
    note: null,
  });

  it('cards in server order (Whole unit last) with counts; rows summarise visible values and link to the capture row', () => {
    h.api['grouped'] = vi.fn(() =>
      of({
        siteId: 'S1',
        groups: [
          { spaceId: 'SP1', spaceName: 'Hall', records: [rec('R1', 'DO-01', 'SP1')] },
          { spaceId: null, spaceName: 'عام', records: [rec('R2', 'DO-02', null)] },
        ],
      }),
    );
    const { el } = renderDetail(h);
    const cards = [...el.querySelectorAll('[data-space]')];
    expect(cards.map((c) => c.getAttribute('data-space'))).toEqual(['SP1', 'whole']);
    expect(cards[0].textContent).toContain('Hall');
    expect(cards[1].textContent).toContain('Whole unit');
    expect(cards[0].querySelector('[data-count]')?.textContent).toContain('1');
    const row = el.querySelector('[data-record="R1"]') as HTMLAnchorElement;
    expect(row.textContent).toContain('DOORS');
    expect(row.textContent).toContain('DO-01');
    // first four VISIBLE fields only (secret is hidden)
    expect(row.querySelector('[data-summary]')?.textContent).toContain('width_cm: 90 cm');
    expect(row.textContent).not.toContain('TOP-SECRET');
    expect(row.getAttribute('href')).toContain('tab=capture');
    expect(row.getAttribute('href')).toContain('m=M1');
    expect(row.getAttribute('href')).toContain('r=R1');
  });

  it('empty → "Nothing captured yet"', () => {
    const { el } = renderDetail(h);
    expect(el.querySelector('[data-spaces-empty]')?.textContent).toContain('Nothing captured yet');
  });

  it('the capture tab highlights the record named by &r=', () => {
    h.query.next(convertToParamMap({ tab: 'capture', m: 'M1', r: 'R1' }));
    const { el } = renderDetail(h);
    expect(el.querySelector('[data-record="R1"]')?.hasAttribute('data-highlight')).toBe(true);
  });
});

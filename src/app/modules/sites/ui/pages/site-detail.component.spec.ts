import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { BehaviorSubject, Observable, of, throwError } from 'rxjs';
import { HttpErrorResponse } from '@angular/common/http';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ConfirmService, ModalService } from '@ds';
import { ProjectAccessStore } from '@modules/projects';
import { ToastService } from '@platform/feedback/toast.service';
import { LocaleService } from '@platform/i18n/locale.service';
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
  docs: Observable<unknown>;
  upload: ReturnType<typeof vi.fn>;
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
    docs: of([{ id: 'D1', fileName: 'hall.jpg', contentType: 'image/jpeg', sizeBytes: 1 }]),
    upload: vi.fn(() => of('D9')),
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
          projectDocuments: () => h.docs,
          uploadDocument: h.upload,
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

  it('A9: the back link label follows a live EN ↔ AR switch', () => {
    const { fixture } = renderDetail(h);
    const locale = TestBed.inject(LocaleService);
    const cta = () =>
      (fixture.componentInstance as unknown as { backCta: () => { label: string } }).backCta();
    locale.locale.set('en');
    const en = cta().label;
    locale.locale.set('ar');
    expect(cta().label).not.toBe(en);
    locale.locale.set('en');
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
    // A9: a caller who cannot decide (an Editor here) is not promised a decision
    TestBed.resetTestingModule();
    level('Editor', 'OnHold');
    ({ el } = renderDetail(h));
    const banner = el.querySelector('[data-banner="closed"]')?.textContent ?? '';
    expect(banner).toContain('Survey work is closed:');
    expect(banner).not.toContain('can still be approved');
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

  // Corrected (review A2): the backend refuses only APPROVING one's own survey; rejecting it stays
  // allowed (SiteCommandHandlers.cs:236-247, `if (command.Request.Approved && …)`).
  it('403 SelfApprovalNotAllowed: inline message; Approve goes away for the session, Reject stays', async () => {
    h.site = detail({ status: 2 });
    h.api = { decide: vi.fn(() => throwError(() => problem(403, 'sites.SelfApprovalNotAllowed'))) };
    const { fixture, el } = renderDetail(h);
    (el.querySelector('[data-act="approve"] button') as HTMLButtonElement).click();
    const data = h.modalOpen.mock.calls[0][1].data as SiteDecideDialogData;
    const outcome = await data.save(null);
    expect(outcome.code).toBe('sites.SelfApprovalNotAllowed');
    expect(outcome.message).toBeTruthy();
    fixture.detectChanges();
    expect(buttons(el)).toEqual(['reject']);
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

  it('A8: every edit control is named "<column> – <row>"; row buttons name their row', () => {
    const { fixture, el } = renderDetail(h);
    (el.querySelector('[data-edit-grid] button') as HTMLButtonElement).click();
    fixture.detectChanges();
    (el.querySelector('[data-add-row] button') as HTMLButtonElement).click();
    fixture.detectChanges();
    const rows = [...el.querySelectorAll('[data-grid="edit"] [data-row]')];
    const controls = [...rows[0].querySelectorAll('input, button[aria-haspopup="listbox"]')];
    expect(controls.length).toBeGreaterThanOrEqual(6);
    // inputs announce their value themselves; a select trigger carries it in its name (V-1)
    for (const c of controls)
      expect(c.getAttribute('aria-label')).toMatch(
        c.tagName === 'INPUT' ? / – DO-01$/ : / – DO-01: .+$/,
      );
    const names = controls.map((c) => c.getAttribute('aria-label'));
    expect(names).toContain('Space – DO-01: Whole unit'); // the selected value
    expect(names).toContain('Category – DO-01: Category'); // nothing picked → the placeholder
    expect(names).toContain('Label – DO-01');
    expect(names).toContain('width_cm (cm) – DO-01');
    expect(names).toContain('Note – DO-01');
    expect(rows[0].querySelector('[data-remove] button')?.textContent).toContain('DO-01');
    expect(rows[0].querySelector('[data-duplicate] button')?.textContent).toContain('DO-01');
    // a row without a label yet is named by its position
    (rows[1].querySelector('[data-cell="label"] input') as HTMLInputElement).value = '';
    (rows[1].querySelector('[data-cell="label"] input') as HTMLInputElement).dispatchEvent(
      new Event('input'),
    );
    fixture.detectChanges();
    expect(rows[1].querySelector('[data-cell="note"] input')?.getAttribute('aria-label')).toBe(
      'Note – Row 2',
    );
  });

  it('A3: an edited grid asks before a tab switch or leaving the route drops it; a clean one does not', async () => {
    const { fixture, el } = renderDetail(h);
    const page = fixture.componentInstance as unknown as {
      go(tab: string): Promise<void>;
      canLeave(): Promise<boolean>;
    };
    const nav = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    (el.querySelector('[data-edit-grid] button') as HTMLButtonElement).click();
    fixture.detectChanges();
    // an opened but untouched draft loses nothing
    expect(await page.canLeave()).toBe(true);
    expect(h.confirmOpen).not.toHaveBeenCalled();
    (el.querySelector('[data-add-row] button') as HTMLButtonElement).click();
    fixture.detectChanges();
    h.confirmOpen.mockResolvedValueOnce(false);
    await page.go('overview');
    expect(h.confirmOpen).toHaveBeenCalledTimes(1);
    expect(nav).not.toHaveBeenCalled();
    h.confirmOpen.mockResolvedValueOnce(false);
    expect(await page.canLeave()).toBe(false);
    h.confirmOpen.mockResolvedValueOnce(true);
    await page.go('overview');
    expect(nav).toHaveBeenCalledTimes(1);
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

describe('SiteDetailComponent — families (sites S-7)', () => {
  let h: DetailHarness;
  const fam = {
    siteId: 'S1',
    moduleId: 'M1',
    groupBy: ['width_cm'],
    families: [
      { familyKey: 'width_cm=90', instances: 2, spaceCount: 1, members: ['DO-01', 'DO-02'] },
    ],
  };
  beforeEach(() => {
    h = harness();
    h.query.next(convertToParamMap({ tab: 'families' }));
    h.site = detail({ recordCounts: [{ moduleId: 'M1', code: 'DOORS', recordCount: 2 }] });
    h.api['families'] = vi.fn(() => of(fam));
  });
  const flush = async (fixture: { detectChanges: () => void }) => {
    await new Promise((r) => setTimeout(r));
    fixture.detectChanges();
  };

  it('Exact sends no groupBy; the table has one column per groupBy code (value of the first member), instances, spaces, members', async () => {
    const { fixture, el } = renderDetail(h);
    await flush(fixture);
    expect(h.api['families']).toHaveBeenLastCalledWith('S1', 'M1', null);
    const table = el.querySelector('[data-families]')!;
    expect(
      [...table.querySelectorAll('th[data-col]')].map((c) => c.getAttribute('data-col')),
    ).toEqual(['width_cm']);
    expect(table.querySelector('[data-cell="width_cm"]')?.textContent).toContain('90 cm');
    expect(table.querySelector('[data-instances]')?.textContent).toContain('2');
    expect(table.textContent).toContain('DO-01, DO-02');
  });

  it('Size sends size; a 400 NoDimensions shows inline with the code, not a toast', async () => {
    h.api['families'] = vi.fn((_s: string, _m: string, g: string | null) =>
      g === 'size'
        ? throwError(
            () =>
              new HttpErrorResponse({
                status: 400,
                error: {
                  title: 'sites.families.NoDimensions',
                  errors: { 'sites.families.NoDimensions': ['none'] },
                },
              }),
          )
        : of(fam),
    );
    const { fixture, el } = renderDetail(h);
    await flush(fixture);
    (el.querySelector('[data-mode="size"] button') as HTMLButtonElement).click();
    await flush(fixture);
    expect(h.api['families']).toHaveBeenLastCalledWith('S1', 'M1', 'size');
    const banner = el.querySelector('[data-family-error]')!;
    expect(banner.textContent).toContain('sites.families.NoDimensions');
    expect(banner.textContent).toContain('no dimensional fields');
    expect(TestBed.inject(ToastService).show).not.toHaveBeenCalled();
  });

  it('Custom lists every schema field (hidden too) and sends the picked codes joined by ","; none picked → UnknownGroupBy banner, no call', async () => {
    const { fixture, el } = renderDetail(h);
    await flush(fixture);
    (el.querySelector('[data-mode="custom"] button') as HTMLButtonElement).click();
    await flush(fixture);
    const pills = [...el.querySelectorAll('[data-family-fields] [data-field]')].map((p) =>
      p.getAttribute('data-field'),
    );
    expect(pills).toEqual(['width_cm', 'kind', 'secret', 'finish']);
    expect(el.querySelector('[data-family-error]')?.textContent).toContain(
      'sites.families.UnknownGroupBy',
    );
    const calls = h.api['families'].mock.calls.length;
    (el.querySelector('[data-field="width_cm"] button') as HTMLButtonElement).click();
    (el.querySelector('[data-field="kind"] button') as HTMLButtonElement).click();
    await flush(fixture);
    expect(h.api['families'].mock.calls.length).toBeGreaterThan(calls);
    expect(h.api['families']).toHaveBeenLastCalledWith('S1', 'M1', 'width_cm,kind');
  });

  it('no module with records → "Nothing captured yet"', () => {
    h.site = detail({ recordCounts: [] });
    const { el } = renderDetail(h);
    expect(el.querySelector('[data-families-empty]')).toBeTruthy();
  });
});

describe('SiteDetailComponent — quantities (sites S-8)', () => {
  let h: DetailHarness;
  beforeEach(() => {
    h = harness();
    h.query.next(convertToParamMap({ tab: 'boq' }));
  });
  const line = {
    moduleCode: 'DOORS',
    kindCode: 'single',
    nameEn: 'Single leaf',
    nameAr: 'ضلفة واحدة',
    occurrences: 3,
    spaces: 2,
    totalQty: 1234.567,
    totalAreaSqm: 5.004,
    totalLengthM: null,
  };

  it('lines: module chip, kind name, counts and totals ≤2 decimals; null → "—"', () => {
    h.api['boq'] = vi.fn(() => of({ siteId: 'S1', lines: [line] }));
    const { el } = renderDetail(h);
    const row = el.querySelector('[data-boq-line]')!;
    expect(row.textContent).toContain('DOORS');
    expect(row.querySelector('[data-kind]')?.textContent).toContain('Single leaf');
    expect(row.querySelector('[data-n="occurrences"]')?.textContent?.trim()).toBe('3');
    expect(row.querySelector('[data-n="qty"]')?.textContent?.trim()).toBe('1,234.57');
    expect(row.querySelector('[data-n="area"]')?.textContent?.trim()).toBe('5');
    expect(row.querySelector('[data-n="length"]')?.textContent?.trim()).toBe('—');
  });

  it('empty → "Nothing captured yet"', () => {
    h.api['boq'] = vi.fn(() => of({ siteId: 'S1', lines: [] }));
    const { el } = renderDetail(h);
    expect(el.querySelector('[data-boq-empty]')).toBeTruthy();
  });
});

describe('SiteDetailComponent — documents (sites S-9)', () => {
  let h: DetailHarness;
  const link = (id: string, kind: number, recordId: string | null, documentId = 'D1') => ({
    id,
    documentId,
    siteId: recordId ? null : 'S1',
    recordId,
    kind,
    addedById: 'E-add',
    createdAtUtc: '2026-11-02T08:00:00Z',
  });
  beforeEach(() => {
    h = harness();
    h.perms.add('documents.read');
    h.perms.add('documents.upload');
    h.query.next(convertToParamMap({ tab: 'documents' }));
    h.site = detail({ recordCounts: [{ moduleId: 'M1', code: 'DOORS', recordCount: 1 }] });
    h.api['documents'] = vi.fn(() =>
      of([link('L1', 3, null), link('L2', 1, 'R1', 'D-gone'), link('L3', 3, 'R1')]),
    );
    h.api['grouped'] = vi.fn(() =>
      of({
        siteId: 'S1',
        groups: [
          {
            spaceId: null,
            spaceName: 'x',
            records: [
              {
                id: 'R1',
                moduleId: 'M1',
                label: 'DO-01',
                spaceId: null,
                spaceName: null,
                catalogItemId: null,
                sortOrder: 1,
                note: null,
              },
            ],
          },
        ],
      }),
    );
    h.api['linkDocument'] = vi.fn(() => of('L9'));
    h.api['unlinkDocument'] = vi.fn(() => of(undefined));
  });

  it('groups by kind in enum order (Sketch, Video, Photo) with counts; cards carry file name, subject, adder', () => {
    const { el } = renderDetail(h);
    const groups = [...el.querySelectorAll('[data-kind-group]')];
    expect(groups.map((g) => g.getAttribute('data-kind-group'))).toEqual(['1', '3']);
    expect(groups[1].querySelector('h3')?.textContent).toContain('Photo · 2');
    const l1 = el.querySelector('[data-link="L1"]')!;
    expect(l1.querySelector('[data-file-name]')?.textContent).toContain('hall.jpg');
    expect(l1.querySelector('[data-subject]')?.textContent).toContain('Whole survey');
    expect(l1.textContent).toContain('Name E-add');
    expect(el.querySelector('[data-link="L2"] [data-subject]')?.textContent).toContain(
      'DOORS · DO-01',
    );
    // a document not in the project list → generic name
    expect(el.querySelector('[data-link="L2"] [data-file-name]')?.textContent).toContain(
      'Document',
    );
    expect(el.querySelector('[data-upload]')).toBeTruthy();
    expect(el.querySelector('[data-attach]')).toBeTruthy();
  });

  it('Attach existing → dialog save posts R19 {documentId, kind, recordId}; DocumentAlreadyLinked comes back inline', async () => {
    const { el } = renderDetail(h);
    (el.querySelector('[data-attach] button') as HTMLButtonElement).click();
    const data = h.modalOpen.mock.calls[0][1].data;
    expect(data.mode).toBe('link');
    expect(data.documents).toEqual([{ value: 'D1', label: 'hall.jpg' }]);
    expect(data.subjects.map((o: { label: string }) => o.label)).toEqual([
      'Whole survey',
      'DOORS · DO-01',
    ]);
    expect(await data.save({ file: null, documentId: 'D1', kind: 3, recordId: 'R1' })).toEqual({
      ok: true,
    });
    expect(h.api['linkDocument']).toHaveBeenCalledWith('S1', {
      documentId: 'D1',
      kind: 3,
      recordId: 'R1',
    });
    h.api['linkDocument'].mockReturnValue(
      throwError(
        () =>
          new HttpErrorResponse({
            status: 409,
            error: {
              title: 'sites.DocumentAlreadyLinked',
              errors: { 'sites.DocumentAlreadyLinked': ['dup'] },
            },
          }),
      ),
    );
    const out = await data.save({ file: null, documentId: 'D1', kind: 3, recordId: null });
    expect(out.ok).toBe(false);
    expect(out.code).toBe('sites.DocumentAlreadyLinked');
    expect(out.message).toBeTruthy();
  });

  it('Upload stores the file in the project documents, then links the new id', async () => {
    const { el } = renderDetail(h);
    (el.querySelector('[data-upload] button') as HTMLButtonElement).click();
    const data = h.modalOpen.mock.calls[0][1].data;
    expect(data.mode).toBe('upload');
    const file = new File(['x'], 'a.jpg');
    expect((await data.save({ file, documentId: null, kind: 1, recordId: null })).ok).toBe(true);
    expect(h.upload).toHaveBeenCalledWith('P', file);
    expect(h.api['linkDocument']).toHaveBeenCalledWith('S1', {
      documentId: 'D9',
      kind: 1,
      recordId: null,
    });
  });

  it('A4: uploaded but not linked → a retry with the same file links the kept id, no second upload', async () => {
    const { el } = renderDetail(h);
    (el.querySelector('[data-upload] button') as HTMLButtonElement).click();
    const data = h.modalOpen.mock.calls[0][1].data;
    const file = new File(['x'], 'a.jpg');
    h.api['linkDocument'].mockReturnValueOnce(
      throwError(
        () =>
          new HttpErrorResponse({ status: 409, error: { errors: { 'sites.SiteLocked': ['x'] } } }),
      ),
    );
    const first = await data.save({ file, documentId: null, kind: 1, recordId: null });
    expect(first.ok).toBe(false);
    expect(first.message).toBeTruthy();
    expect((await data.save({ file, documentId: null, kind: 1, recordId: null })).ok).toBe(true);
    expect(h.upload).toHaveBeenCalledTimes(1);
    expect(h.api['linkDocument']).toHaveBeenCalledTimes(2);
    expect(h.api['linkDocument']).toHaveBeenLastCalledWith('S1', {
      documentId: 'D9',
      kind: 1,
      recordId: null,
    });
  });

  it('Detach: danger confirm → DELETE the link', async () => {
    const { fixture, el } = renderDetail(h);
    (el.querySelector('[data-link="L1"] [data-detach] button') as HTMLButtonElement).click();
    await new Promise((r) => setTimeout(r));
    fixture.detectChanges();
    expect(h.confirmOpen.mock.calls[0][0].tone).toBe('danger');
    expect(h.api['unlinkDocument']).toHaveBeenCalledWith('S1', 'L1');
  });

  it('A1 / BF-1: documents.read 403 → names hidden, Attach hidden, reason shown; no upload claim → Upload hidden with reason', () => {
    h.docs = throwError(() => new HttpErrorResponse({ status: 403 }));
    h.perms.delete('documents.upload');
    const { el } = renderDetail(h);
    expect(el.querySelector('[data-docs-read-unavailable]')).toBeTruthy();
    expect(el.querySelector('[data-docs-upload-unavailable]')).toBeTruthy();
    expect(el.querySelector('[data-attach]')).toBeNull();
    expect(el.querySelector('[data-upload]')).toBeNull();
    expect(el.querySelector('[data-link="L1"] [data-file-name]')?.textContent).toContain(
      'Document',
    );
  });

  it('no writes for a viewer or on a submitted survey', () => {
    h.site = detail({ status: 2 });
    const { el } = renderDetail(h);
    expect(el.querySelector('[data-upload]')).toBeNull();
    expect(el.querySelector('[data-attach]')).toBeNull();
    expect(el.querySelector('[data-detach]')).toBeNull();
  });
});

import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { BehaviorSubject, of, throwError } from 'rxjs';
import { HttpErrorResponse } from '@angular/common/http';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ConfirmService, ModalService } from '@ds';
import { ProjectAccessStore } from '@modules/projects';
import { ToastService } from '@platform/feedback/toast.service';
import { PermissionsService } from '@platform/permissions/permissions.service';
import { SiteDefinitionService } from '../../data/site-definition.service';
import { SiteLookupService } from '../../data/site-lookup.service';
import { SiteService } from '../../data/site.service';
import { detail } from '../../testing/site-fixtures';
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
      { provide: SiteLookupService, useValue: { employeeName: (id: string) => of(`Name ${id}`) } },
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

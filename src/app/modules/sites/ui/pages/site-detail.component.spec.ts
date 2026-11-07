import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
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
import { SiteDetailComponent } from './site-detail.component';

export interface DetailHarness {
  perms: Set<string>;
  project: ReturnType<typeof signal<unknown>>;
  me: string | null;
  site: SiteDetail;
  api: Record<string, ReturnType<typeof vi.fn>>;
  modalOpen: ReturnType<typeof vi.fn>;
  confirmOpen: ReturnType<typeof vi.fn>;
  query: BehaviorSubject<ReturnType<typeof convertToParamMap>>;
}

export function harness(): DetailHarness {
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

export function renderDetail(h: DetailHarness, extra: unknown[] = []) {
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

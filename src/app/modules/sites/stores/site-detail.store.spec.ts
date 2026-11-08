import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { Subject, of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ProjectAccessStore } from '@modules/projects';
import { ToastService } from '@platform/feedback/toast.service';
import { PermissionsService } from '@platform/permissions/permissions.service';
import { SiteDefinitionService } from '../data/site-definition.service';
import { SiteLookupService } from '../data/site-lookup.service';
import { SiteService } from '../data/site.service';
import { EMPTY_UNIT_DATA } from '../model/site.model';
import { detail } from '../testing/site-fixtures';
import { SiteDetailStore } from './site-detail.store';

const problem = (status: number, code: string) =>
  new HttpErrorResponse({ status, error: { errors: { [code]: ['msg'] } } });

describe('SiteDetailStore (sites S-3 / S-4)', () => {
  let api: Record<string, ReturnType<typeof vi.fn>>;
  let project: ReturnType<typeof signal<unknown>>;
  let access: {
    ensure: ReturnType<typeof vi.fn>;
    refresh: ReturnType<typeof vi.fn>;
    project: () => typeof project;
    me: () => string | null;
  };
  let toast: { show: ReturnType<typeof vi.fn> };
  let perms: Set<string>;

  function make() {
    TestBed.configureTestingModule({
      providers: [
        SiteDetailStore,
        { provide: SiteService, useValue: api },
        {
          provide: SiteDefinitionService,
          useValue: {
            modules: () =>
              of([
                {
                  id: 'M2',
                  code: 'WIN',
                  nameEn: 'Windows',
                  nameAr: 'شبابيك',
                  sortOrder: 2,
                  isActive: true,
                },
                {
                  id: 'M1',
                  code: 'DOORS',
                  nameEn: 'Doors',
                  nameAr: 'أبواب',
                  sortOrder: 1,
                  isActive: true,
                },
                {
                  id: 'M3',
                  code: 'OLD',
                  nameEn: 'Old',
                  nameAr: 'قديم',
                  sortOrder: 0,
                  isActive: false,
                },
              ]),
          },
        },
        {
          provide: SiteLookupService,
          useValue: { employeeName: (id: string) => of(`Name ${id}`) },
        },
        { provide: ProjectAccessStore, useValue: access },
        { provide: PermissionsService, useValue: { can: (p: string) => perms.has(p) } },
        { provide: ToastService, useValue: toast },
      ],
    });
    return TestBed.inject(SiteDetailStore);
  }

  beforeEach(() => {
    perms = new Set([
      'sites.read',
      'sites.update',
      'sites.submit',
      'sites.approve',
      'sites.delete',
    ]);
    project = signal<unknown>({ myLevel: 'Manager', status: 'InProgress', isActive: true });
    access = { ensure: vi.fn(), refresh: vi.fn(), project: () => project, me: () => 'E-me' };
    toast = { show: vi.fn() };
    api = {
      getById: vi.fn(() => of(detail())),
      update: vi.fn(() => of(undefined)),
      submit: vi.fn(() => of(undefined)),
      decide: vi.fn(() => of(undefined)),
      reopen: vi.fn(() => of(undefined)),
      remove: vi.fn(() => of(undefined)),
    };
  });

  it('loads the survey, ensures its project, names the creator, keeps active modules by sortOrder', () => {
    const store = make();
    store.load('S1');
    expect(api['getById']).toHaveBeenCalledWith('S1');
    expect(access.ensure).toHaveBeenCalledWith('P');
    expect(store.name('E-creator')).toBe('Name E-creator');
    expect(store.modules().map((m) => m.id)).toEqual(['M1', 'M2']);
    expect(store.caps().edit).toBe(true);
  });

  it('404 → not-found state', () => {
    api['getById'].mockReturnValue(throwError(() => problem(404, 'sites.NotFound')));
    const store = make();
    store.load('S1');
    expect(store.notFound()).toBe(true);
    expect(store.site()).toBeNull();
  });

  it('updateUnit → PUT, toast, reload', async () => {
    const store = make();
    store.load('S1');
    const outcome = await store.updateUnit({ ...EMPTY_UNIT_DATA, address: 'A' });
    expect(api['update']).toHaveBeenCalledWith('S1', { ...EMPTY_UNIT_DATA, address: 'A' });
    expect(outcome.ok).toBe(true);
    expect(api['getById']).toHaveBeenCalledTimes(2);
  });

  it('409 ConcurrencyConflict / SiteLocked / InvalidTransition → reload + "changed" toast, dialog closes', async () => {
    const store = make();
    store.load('S1');
    for (const code of [
      'sites.ConcurrencyConflict',
      'sites.SiteLocked',
      'sites.InvalidTransition',
    ]) {
      api['update'].mockReturnValueOnce(throwError(() => problem(409, code)));
      const calls = api['getById'].mock.calls.length;
      const outcome = await store.updateUnit(EMPTY_UNIT_DATA);
      expect(outcome.reloaded, code).toBe(true);
      expect(api['getById'].mock.calls.length, code).toBe(calls + 1);
    }
    expect(toast.show).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Changed by someone else — reloaded.' }),
    );
  });

  it('403 InsufficientLevel refreshes the level; 409 ProjectClosed refreshes the project; both inline', async () => {
    const store = make();
    store.load('S1');
    api['update'].mockReturnValueOnce(throwError(() => problem(403, 'sites.InsufficientLevel')));
    let outcome = await store.updateUnit(EMPTY_UNIT_DATA);
    expect(access.refresh).toHaveBeenCalledWith('P');
    expect(outcome.message).toBeTruthy();
    api['update'].mockReturnValueOnce(throwError(() => problem(409, 'sites.ProjectClosed')));
    outcome = await store.updateUnit(EMPTY_UNIT_DATA);
    expect(access.refresh).toHaveBeenCalledTimes(2);
    expect(outcome.code).toBe('sites.ProjectClosed');
  });

  it('ignores a second write while one is in flight', async () => {
    const pending = new Subject<void>();
    api['update'].mockReturnValueOnce(pending);
    const store = make();
    store.load('S1');
    const first = store.updateUnit(EMPTY_UNIT_DATA);
    expect(store.busy()).toBe(true);
    const second = await store.updateUnit(EMPTY_UNIT_DATA);
    expect(second.ok).toBe(false);
    pending.next();
    pending.complete();
    expect((await first).ok).toBe(true);
    expect(api['update']).toHaveBeenCalledTimes(1);
  });
});

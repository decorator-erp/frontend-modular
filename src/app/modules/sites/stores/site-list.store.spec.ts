import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { HttpErrorResponse } from '@angular/common/http';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ProjectService } from '@modules/projects';
import { PermissionsService } from '@platform/permissions/permissions.service';
import { SiteService } from '../data/site.service';
import { SITE_PAGE_SIZE, SiteListStore } from './site-list.store';

const proj = (id: string, myLevel: string, status = 'InProgress', isActive = true) => ({
  id,
  code: id,
  name: `Project ${id}`,
  myLevel,
  status,
  isActive,
});
const page = (n: number) => ({
  items: [],
  pageNumber: 1,
  pageSize: 1,
  totalCount: n,
  totalPages: n,
});

describe('SiteListStore (sites S-2)', () => {
  let projects: { getAll: ReturnType<typeof vi.fn> };
  let api: { list: ReturnType<typeof vi.fn> };
  let perms: Set<string>;

  function make() {
    TestBed.configureTestingModule({
      providers: [
        SiteListStore,
        { provide: ProjectService, useValue: projects },
        { provide: SiteService, useValue: api },
        { provide: PermissionsService, useValue: { can: (p: string) => perms.has(p) } },
      ],
    });
    return TestBed.inject(SiteListStore);
  }

  beforeEach(() => {
    perms = new Set(['sites.read', 'sites.create']);
    projects = {
      getAll: vi.fn((p: number) =>
        of(
          p === 1
            ? {
                items: [proj('A', 'Viewer'), proj('B', 'Editor')],
                totalPages: 2,
                totalCount: 3,
                page: 1,
                pageSize: 200,
              }
            : {
                items: [proj('C', 'Manager', 'OnHold')],
                totalPages: 2,
                totalCount: 3,
                page: 2,
                pageSize: 200,
              },
        ),
      ),
    };
    api = {
      list: vi.fn((q: { status?: number | null; pageSize?: number }) =>
        of(q.pageSize === 1 ? page(q.status ?? 0) : { ...page(30), pageSize: SITE_PAGE_SIZE }),
      ),
    };
  });

  it('reads every project page (200 each), selects ?projectId when listed, else the first', () => {
    const store = make();
    store.loadProjects('B');
    expect(projects.getAll).toHaveBeenCalledWith(1, 200);
    expect(projects.getAll).toHaveBeenCalledWith(2, 200);
    expect(store.projects().map((p) => p.id)).toEqual(['A', 'B', 'C']);
    expect(store.projectId()).toBe('B');
    store.loadProjects('nope');
    expect(store.projectId()).toBe('A');
  });

  it('lists on pageIndex/pageSize 25 and counts with four pageSize=1 reads', () => {
    const store = make();
    store.loadProjects('B');
    expect(api.list).toHaveBeenCalledWith({
      projectId: 'B',
      status: null,
      pageIndex: 1,
      pageSize: 25,
    });
    for (const status of [1, 2, 3, 4])
      expect(api.list).toHaveBeenCalledWith({ projectId: 'B', status, pageIndex: 1, pageSize: 1 });
    expect(store.counts()).toEqual({ 1: 1, 2: 2, 3: 3, 4: 4 });
    expect(store.totalAll()).toBe(10);
    store.setStatus(2);
    expect(api.list).toHaveBeenLastCalledWith({
      projectId: 'B',
      status: 2,
      pageIndex: 1,
      pageSize: 25,
    });
    store.setPage(3);
    expect(api.list).toHaveBeenLastCalledWith({
      projectId: 'B',
      status: 2,
      pageIndex: 3,
      pageSize: 25,
    });
  });

  it('create is offered on an open project at Editor+ with sites.create only', () => {
    const store = make();
    store.loadProjects('A');
    expect(store.canCreate()).toBe(false); // Viewer
    store.select('B');
    expect(store.canCreate()).toBe(true);
    store.select('C');
    expect(store.canCreate()).toBe(false); // OnHold
    expect(store.creatableProjects().map((p) => p.id)).toEqual(['B']);
    TestBed.resetTestingModule();
    perms.delete('sites.create');
    const other = make();
    other.loadProjects('B');
    expect(other.canCreate()).toBe(false);
    expect(other.creatableProjects()).toEqual([]);
  });

  it('a failed list shows its catalog message; no project → empty', () => {
    api.list.mockReturnValue(
      throwError(
        () =>
          new HttpErrorResponse({
            status: 404,
            error: { errors: { 'projects.NotFound': ['x'] } },
          }),
      ),
    );
    const store = make();
    store.loadProjects(null);
    expect(store.error()).toBeTruthy();
    expect(store.counts()).toBeNull();
    projects.getAll.mockReturnValue(
      of({ items: [], totalPages: 0, totalCount: 0, page: 1, pageSize: 200 }),
    );
    store.loadProjects(null);
    expect(store.projects()).toEqual([]);
    expect(store.projectId()).toBeNull();
  });
});

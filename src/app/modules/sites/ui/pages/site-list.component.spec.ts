import { TestBed } from '@angular/core/testing';
import { provideRouter, Router, ActivatedRoute } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ModalService } from '@ds';
import { ProjectService } from '@modules/projects';
import { ToastService } from '@platform/feedback/toast.service';
import { PermissionsService } from '@platform/permissions/permissions.service';
import { SiteService } from '../../data/site.service';
import { SiteListComponent } from './site-list.component';
import type { SiteUnitDialogData } from '../detail/site-unit-dialog.component';
import { EMPTY_UNIT_DATA } from '../../model/site.model';

const proj = (id: string, myLevel: string, status = 'InProgress') => ({
  id,
  code: `PRJ-${id}`,
  name: `Project ${id}`,
  myLevel,
  status,
  isActive: true,
});

describe('SiteListComponent (sites S-2)', () => {
  let perms: Set<string>;
  let projects: ReturnType<typeof proj>[];
  let api: { list: ReturnType<typeof vi.fn>; create: ReturnType<typeof vi.fn> };
  let modalOpen: ReturnType<typeof vi.fn>;
  let afterClosed: Promise<unknown>;
  let nav: ReturnType<typeof vi.fn>;

  function render(query: Record<string, string> = {}) {
    TestBed.configureTestingModule({
      imports: [SiteListComponent],
      providers: [
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { queryParamMap: new Map(Object.entries(query)) } },
        },
        {
          provide: ProjectService,
          useValue: {
            getAll: () =>
              of({
                items: projects,
                totalPages: 1,
                totalCount: projects.length,
                page: 1,
                pageSize: 200,
              }),
          },
        },
        { provide: SiteService, useValue: api },
        { provide: PermissionsService, useValue: { can: (p: string) => perms.has(p) } },
        { provide: ModalService, useValue: { open: modalOpen } },
        { provide: ToastService, useValue: { show: vi.fn() } },
      ],
    });
    nav = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    const fixture = TestBed.createComponent(SiteListComponent);
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  beforeEach(() => {
    perms = new Set(['sites.read', 'sites.create']);
    projects = [proj('A', 'Editor'), proj('B', 'Viewer'), proj('C', 'Manager', 'Completed')];
    api = {
      list: vi.fn((q: { status?: number | null; pageSize: number }) =>
        of({
          items:
            q.pageSize === 1
              ? []
              : [
                  {
                    id: 'S1',
                    code: 'SITE-00001',
                    status: 1,
                    address: 'Nasr City',
                    surveyedOn: '2026-11-01',
                    createdAtUtc: '2026-11-01T08:00:00Z',
                  },
                ],
          pageNumber: 1,
          pageSize: q.pageSize,
          totalCount: q.pageSize === 1 ? (q.status ?? 0) : 1,
          totalPages: 1,
        }),
      ),
      create: vi.fn(() => of('S9')),
    };
    afterClosed = Promise.resolve(undefined);
    modalOpen = vi.fn(() => ({ afterClosed: () => afterClosed }));
  });

  it('shows the picker, level chip, pills with counts, KPIs and the rows', () => {
    const { el } = render({ projectId: 'A' });
    expect(el.querySelector('[data-level-chip]')?.textContent).toContain('Editor');
    expect(el.querySelector('[data-pill="all"]')?.textContent).toContain('10');
    expect(el.querySelector('[data-pill="2"]')?.textContent).toContain('Submitted');
    expect(el.querySelector('[data-kpi="4"]')?.textContent).toContain('4');
    expect(el.textContent).toContain('SITE-00001');
    expect(el.textContent).toContain('Nasr City');
  });

  it('A10: project, status and page live in the URL — read on load, written back (replaceUrl)', async () => {
    const { fixture, el } = render({ projectId: 'B', status: '2', page: '3' });
    expect(api.list).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: 'B', status: 2, pageIndex: 3, pageSize: 25 }),
    );
    expect(nav).toHaveBeenLastCalledWith(['/sites'], {
      queryParams: { projectId: 'B', status: 2, page: 3 },
      replaceUrl: true,
    });
    (el.querySelector('[data-pill="4"] button') as HTMLButtonElement).click();
    fixture.detectChanges();
    await Promise.resolve();
    expect(nav).toHaveBeenLastCalledWith(['/sites'], {
      queryParams: { projectId: 'B', status: 4, page: null },
      replaceUrl: true,
    });
    // junk in the URL falls back to All / page 1
    TestBed.resetTestingModule();
    render({ projectId: 'A', status: '9', page: '-1' });
    expect(api.list).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: 'A', status: null, pageIndex: 1, pageSize: 25 }),
    );
  });

  it('New survey: needs sites.create AND Editor on an open project', () => {
    let { el } = render({ projectId: 'A' });
    expect(el.querySelector('[data-new-survey]')).toBeTruthy();
    TestBed.resetTestingModule();
    ({ el } = render({ projectId: 'B' }));
    expect(el.querySelector('[data-new-survey]')).toBeNull();
    TestBed.resetTestingModule();
    ({ el } = render({ projectId: 'C' }));
    expect(el.querySelector('[data-new-survey]')).toBeNull();
    expect(el.querySelector('[data-closed-banner]')?.textContent).toContain('Completed');
    TestBed.resetTestingModule();
    perms.delete('sites.create');
    ({ el } = render({ projectId: 'A' }));
    expect(el.querySelector('[data-new-survey]')).toBeNull();
  });

  it('the create modal offers only Editor+ open projects and navigates to the new survey', async () => {
    afterClosed = Promise.resolve('S9');
    const { el } = render({ projectId: 'A' });
    (el.querySelector('[data-new-survey] button') as HTMLButtonElement).click();
    const data = modalOpen.mock.calls[0][1].data as SiteUnitDialogData;
    expect(data.projects!.map((p) => p.id)).toEqual(['A']);
    const outcome = await data.save('A', EMPTY_UNIT_DATA);
    expect(api.create).toHaveBeenCalledWith('A', EMPTY_UNIT_DATA);
    expect(outcome).toEqual({ ok: true, value: 'S9' });
    await afterClosed;
    await Promise.resolve();
    expect(nav).toHaveBeenCalledWith(['/sites', 'S9']);
  });

  it.each([
    'sites.ProjectClosed',
    'sites.InsufficientLevel',
    'sites.ProjectNotFound',
    'sites.InvalidData',
  ])('a create refused with %s is shown inline (catalog message + code)', async (code) => {
    api.create.mockReturnValue(
      throwError(
        () => new HttpErrorResponse({ status: 409, error: { errors: { [code]: ['m'] } } }),
      ),
    );
    const { el } = render({ projectId: 'A' });
    (el.querySelector('[data-new-survey] button') as HTMLButtonElement).click();
    const data = modalOpen.mock.calls[0][1].data as SiteUnitDialogData;
    const outcome = await data.save('A', EMPTY_UNIT_DATA);
    expect(outcome.ok).toBe(false);
    expect(outcome.code).toBe(code);
    expect(outcome.message).toBeTruthy();
  });

  it('400 validation paths land on their unit-data fields', async () => {
    api.create.mockReturnValue(
      throwError(
        () =>
          new HttpErrorResponse({
            status: 400,
            error: {
              title: 'Validation.General',
              errors: { 'Request.Data.Address': ['Too long'] },
            },
          }),
      ),
    );
    const { el } = render({ projectId: 'A' });
    (el.querySelector('[data-new-survey] button') as HTMLButtonElement).click();
    const data = modalOpen.mock.calls[0][1].data as SiteUnitDialogData;
    const outcome = await data.save('A', EMPTY_UNIT_DATA);
    expect(outcome.fieldErrors).toEqual({ address: 'Too long' });
  });

  it('empty states: no projects, no surveys', () => {
    projects = [];
    let { el } = render();
    expect(el.textContent).toContain('No projects you can reach');
    TestBed.resetTestingModule();
    projects = [proj('A', 'Editor')];
    api.list.mockImplementation((q: { pageSize: number }) =>
      of({ items: [], pageNumber: 1, pageSize: q.pageSize, totalCount: 0, totalPages: 0 }),
    );
    ({ el } = render());
    expect(el.textContent).toContain('No surveys yet');
  });
});

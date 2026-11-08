import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { ConfirmService } from '@ds';
import { EmployeeService } from '@modules/people';
import { PERM, PermissionsService } from '@platform/permissions';
import { ToastService } from '@platform/feedback/toast.service';
import { ProjectService } from '../../data/project.service';
import { ProjectMemberService } from '../../data/project-member.service';
import { ProjectAccessStore } from '../../stores/project-access.store';
import type { ProjectLevel } from '../../model/project-actions';
import { ProjectMembersPageComponent } from './project-members-page.component';

const member = {
  id: 'M1',
  projectId: 'P1',
  employeeId: 'E1',
  access: 'Contributor',
  canManage: false,
  canExecuteTasks: true,
  employeeName: 'Sara',
  addedAtUtc: '2026-11-01T08:00:00Z',
};

function setup(
  opts: {
    level?: ProjectLevel;
    perms?: string[];
    project$?: unknown;
    status?: string;
    add$?: unknown;
  } = {},
) {
  const api = {
    getByProject: vi.fn(() => of([member])),
    add: vi.fn(() => opts.add$ ?? of('M2')),
    changeAccess: vi.fn(() => of(undefined)),
    remove: vi.fn(() => of(undefined)),
  };
  const perms = new Set(opts.perms ?? [PERM.projects.read, PERM.projects.manageMembers]);
  const level = { current: opts.level ?? 'Manager' };
  const access = { seed: vi.fn(), refresh: vi.fn(), ensure: vi.fn() };
  const getById = vi.fn(
    () =>
      opts.project$ ??
      of({
        id: 'P1',
        status: opts.status ?? 'InProgress',
        isActive: true,
        myLevel: level.current,
      }),
  );
  TestBed.configureTestingModule({
    imports: [ProjectMembersPageComponent],
    providers: [
      provideRouter([]),
      {
        provide: ActivatedRoute,
        useValue: { snapshot: { paramMap: convertToParamMap({ id: 'P1' }) } },
      },
      {
        provide: ProjectService,
        useValue: { getById },
      },
      { provide: ProjectAccessStore, useValue: access },
      { provide: ProjectMemberService, useValue: api },
      {
        provide: EmployeeService,
        useValue: {
          listPaged: () =>
            of({
              items: [
                { id: 'E1', fullName: 'Sara' },
                { id: 'E2', fullName: 'Omar' },
              ],
            }),
        },
      },
      { provide: PermissionsService, useValue: { can: (p: string) => perms.has(p) } },
      { provide: ConfirmService, useValue: { open: () => Promise.resolve(true) } },
      { provide: ToastService, useValue: { show: vi.fn() } },
    ],
  });
  const fixture = TestBed.createComponent(ProjectMembersPageComponent);
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  return { fixture, c: fixture.componentInstance, el, api, access, getById, level };
}

describe('ProjectMembersPageComponent (crmp P-1)', () => {
  it.each([
    ['Viewer', false],
    ['Editor', false],
    ['Manager', true],
  ] as const)('%s: add / change level / remove shown = %s', (level, shown) => {
    const { el } = setup({ level });
    expect(!!el.querySelector('[data-add-member]')).toBe(shown);
    expect(!!el.querySelector('[data-remove]')).toBe(shown);
    expect(!!el.querySelector('[data-manager-only]')).toBe(!shown);
    expect(el.querySelector('[data-member-row]')?.textContent).toContain('Sara');
  });

  it('a Manager without project.manage_members sees no write affordance', () => {
    const { el } = setup({ level: 'Manager', perms: [PERM.projects.read] });
    expect(el.querySelector('[data-add-member]')).toBeNull();
  });

  it('adds with the picked employee and level (Editor → access Contributor)', () => {
    const { c, api } = setup();
    c.newEmployeeId.set('E2');
    c.newLevel.set('Editor');
    c.add();
    expect(api.add).toHaveBeenCalledWith({
      projectId: 'P1',
      employeeId: 'E2',
      access: 'Contributor',
    });
  });

  it('only offers employees who are not members yet', () => {
    const { c } = setup();
    expect(c.employeeOptions().map((o) => o.value)).toEqual(['E2']);
  });

  it('shows AlreadyMember inline', () => {
    const err = new HttpErrorResponse({
      status: 409,
      error: { errors: { 'projects.members.AlreadyMember': ['x'] } },
    });
    const { c, fixture, el } = setup({ add$: throwError(() => err) });
    c.newEmployeeId.set('E2');
    c.add();
    fixture.detectChanges();
    expect(el.querySelector('[data-inline-error]')?.textContent).toContain('already a member');
    expect(c.busy()).toBe(false);
  });

  it('a members.ConcurrentUpdate 409 reloads instead of showing an inline error', () => {
    const err = new HttpErrorResponse({
      status: 409,
      error: { errors: { 'projects.members.ConcurrentUpdate': ['x'] } },
    });
    const { c, api } = setup({ add$: throwError(() => err) });
    const before = api.getByProject.mock.calls.length;
    c.newEmployeeId.set('E2');
    c.add();
    expect(c.inlineError()).toBeNull();
    expect(api.getByProject.mock.calls.length).toBeGreaterThan(before);
  });

  it('ignores a second add while one is in flight', () => {
    const { c, api } = setup({ add$: of() });
    c.newEmployeeId.set('E2');
    c.busy.set(true);
    c.add();
    expect(api.add).not.toHaveBeenCalled();
  });

  it('404 shows the not-found state; another failure shows the retry error', () => {
    const nf = setup({ project$: throwError(() => new HttpErrorResponse({ status: 404 })) });
    expect(nf.c.state()).toBe('notFound');
    TestBed.resetTestingModule();
    const er = setup({ project$: throwError(() => new HttpErrorResponse({ status: 500 })) });
    expect(er.c.state()).toBe('error');
  });

  it('a closed project shows the read-only banner; member housekeeping stays open to a Manager', () => {
    const { el } = setup({ status: 'OnHold' });
    expect(el.querySelector('[data-closed-banner]')).toBeTruthy();
    expect(el.querySelector('[data-add-member]')).toBeTruthy();
  });

  // Review B7 (blind-all B6, CP-8): a member write can change the caller's own level.
  it('B7: after a member write the project is read again and the shared access store re-seeded', () => {
    const { c, el, fixture, access, getById, level } = setup();
    expect(access.seed).toHaveBeenCalledTimes(1);
    level.current = 'Viewer'; // the Manager demoted themselves
    c.changeLevel(member as never, 'Viewer');
    fixture.detectChanges();
    expect(getById).toHaveBeenCalledTimes(2);
    expect(access.seed).toHaveBeenCalledTimes(2);
    expect(access.seed).toHaveBeenLastCalledWith(expect.objectContaining({ myLevel: 'Viewer' }));
    expect(el.querySelector('[data-add-member]')).toBeNull();
  });

  it('B7: a project re-read that fails (e.g. removed themselves) refreshes the store instead', () => {
    const { c, access, getById } = setup();
    getById.mockReturnValueOnce(throwError(() => new HttpErrorResponse({ status: 404 })));
    void c.remove(member as never);
    return Promise.resolve().then(() => {
      expect(access.refresh).toHaveBeenCalledWith('P1');
    });
  });
});

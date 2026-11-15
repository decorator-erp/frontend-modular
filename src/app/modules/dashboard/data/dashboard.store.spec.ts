import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { PermissionsService } from '@platform/permissions';
import { AuthStore } from '@platform/auth/auth.store';
import { ProjectService, ProjectTaskService } from '@modules/projects';
import { EmployeeService } from '@modules/people';
import { CrmApprovalsService, CrmLeadService, CrmMyGatheringWorkService } from '@modules/crm';
import { NotificationStore } from '@modules/notifications';
import { DashboardStore } from './dashboard.store';

/** The seeded `employee` baseline (BaselineClaimSeeder) — the widgets it opens. */
export const EMPLOYEE = [
  'project.read',
  'stage_tasks.read',
  'stage_tasks.complete',
  'employees.view_own',
  'notifications.view_own',
  'sites.read',
];
export const MANAGER = [
  ...EMPLOYEE,
  'project.create',
  'approvals.read',
  'crm.briefs.read',
  'crm.leads.read',
];

const project = (id: string, status: string, code = id) => ({
  id,
  code,
  name: `Project ${id}`,
  status,
  isActive: true,
  clientName: 'Client',
  progressPercentage: 40,
});
const task = (id: string, status: string, dueDate: string | null) => ({
  id,
  projectId: 'P1',
  name: `Task ${id}`,
  status,
  dueDate,
});

export function setupDashboard(perms: string[]) {
  const projects = {
    getAll: vi.fn(() =>
      of({
        items: [
          project('P1', 'InProgress'),
          project('P2', 'Completed'),
          project('P3', 'Draft'),
          project('P4', 'InProgress'),
        ],
        totalCount: 4,
        page: 1,
        pageSize: 50,
        totalPages: 1,
      }),
    ),
  };
  const tasks = {
    getByProject: vi.fn((projectId: string) =>
      of(
        {
          P1: [task('T1', 'Open', '2026-12-01'), task('T2', 'Completed', '2026-11-01')],
          P4: [task('T3', 'InProgress', '2026-11-20')],
          P3: [task('T4', 'Open', null)],
        }[projectId] ?? [],
      ),
    ),
  };
  const employees = { getMe: vi.fn(() => of({ id: 'E1', fullName: 'Mona Adel' })) };
  const approvals = {
    pending: vi.fn(() =>
      of({ items: [{ id: 'A1', round: 1, dueAtUtc: null, trackKey: 'A1' }], totalCount: 7 }),
    ),
  };
  const gathering = { list: vi.fn(() => of([])) };
  const leads = {
    statusCounts: vi.fn(() =>
      of({ total: 10, new: 3, contacted: 2, qualified: 1, unqualified: 1, converted: 3 }),
    ),
  };
  const notifications = {
    loadRecent: vi.fn(),
    recent: signal([]),
    loadingRecent: signal(false),
    unreadCount: signal(2),
  };
  TestBed.configureTestingModule({
    providers: [
      DashboardStore,
      {
        provide: PermissionsService,
        useValue: {
          can: (p: string) => perms.includes(p),
          canAll: (ps: string[]) => ps.every((p) => perms.includes(p)),
        },
      },
      { provide: AuthStore, useValue: { user: () => ({ userName: 'mona@example.com' }) } },
      { provide: ProjectService, useValue: projects },
      { provide: ProjectTaskService, useValue: tasks },
      { provide: EmployeeService, useValue: employees },
      { provide: CrmApprovalsService, useValue: approvals },
      { provide: CrmMyGatheringWorkService, useValue: gathering },
      { provide: CrmLeadService, useValue: leads },
      { provide: NotificationStore, useValue: notifications },
    ],
  });
  return { projects, tasks, employees, approvals, gathering, leads, notifications };
}

const settle = () => new Promise((r) => setTimeout(r, 0));

describe('DashboardStore (DB-1)', () => {
  it('an employee triggers only the calls their permissions allow — never approvals, leads or briefs', async () => {
    const api = setupDashboard(EMPLOYEE);
    const store = TestBed.inject(DashboardStore);
    store.load();
    await settle();

    expect(api.projects.getAll).toHaveBeenCalledTimes(1);
    expect(api.employees.getMe).toHaveBeenCalledTimes(1);
    expect(api.tasks.getByProject).toHaveBeenCalled();
    expect(api.notifications.loadRecent).toHaveBeenCalledTimes(1);
    expect(api.approvals.pending).not.toHaveBeenCalled();
    expect(api.leads.statusCounts).not.toHaveBeenCalled();
    expect(api.gathering.list).not.toHaveBeenCalled();
    expect(store.nothingToShow()).toBe(false);
  });

  it('a manager triggers every widget', async () => {
    const api = setupDashboard(MANAGER);
    const store = TestBed.inject(DashboardStore);
    store.load();
    await settle();

    expect(api.approvals.pending).toHaveBeenCalledWith(1, 5);
    expect(api.leads.statusCounts).toHaveBeenCalledTimes(1);
    expect(api.gathering.list).toHaveBeenCalledTimes(1);
    expect(store.approvals().data?.total).toBe(7);
    expect(store.leads().data?.new).toBe(3);
  });

  it('counts open projects as active, lists in-progress first, and scans only open projects for my tasks', async () => {
    const api = setupDashboard(EMPLOYEE);
    const store = TestBed.inject(DashboardStore);
    store.load();
    await settle();

    // Draft counts as active (still open); Completed does not. In progress first, closed last.
    expect(store.projects().data).toMatchObject({ total: 4, active: 3 });
    expect(store.projects().data!.items.map((p) => p.id)).toEqual(['P1', 'P4', 'P3', 'P2']);
    expect(api.tasks.getByProject).toHaveBeenCalledTimes(3);
    expect(api.tasks.getByProject).toHaveBeenCalledWith('P1', { assigneeId: 'E1', pageSize: 50 });
  });

  it('merges my open tasks across projects, due date first, and drops finished ones', async () => {
    setupDashboard(EMPLOYEE);
    const store = TestBed.inject(DashboardStore);
    store.load();
    await settle();

    expect(store.tasks().data!.map((t) => t.id)).toEqual(['T3', 'T1', 'T4']);
    expect(store.tasks().data![0].projectName).toBe('Project P4');
    expect(store.displayName()).toBe('Mona Adel');
  });

  it('no employee record means no tasks of my own, not an error', async () => {
    const api = setupDashboard(EMPLOYEE);
    api.employees.getMe.mockReturnValueOnce(throwError(() => new Error('404')));
    const store = TestBed.inject(DashboardStore);
    store.load();
    await settle();

    expect(store.tasks()).toEqual({ loading: false, error: false, data: [] });
    expect(api.tasks.getByProject).not.toHaveBeenCalled();
  });

  it('one failing source leaves the other widgets intact', async () => {
    const api = setupDashboard(MANAGER);
    api.leads.statusCounts.mockReturnValueOnce(throwError(() => new Error('boom')));
    const store = TestBed.inject(DashboardStore);
    store.load();
    await settle();

    expect(store.leads().error).toBe(true);
    expect(store.projects().error).toBe(false);
    expect(store.approvals().data?.total).toBe(7);
  });

  it('a user with none of the widget permissions has nothing to show', () => {
    setupDashboard([]);
    const store = TestBed.inject(DashboardStore);
    store.load();
    expect(store.nothingToShow()).toBe(true);
  });

  it('LC-2: without an employee record (an admin), gathering work is not requested — no 403', async () => {
    const api = setupDashboard(MANAGER);
    api.employees.getMe.mockReturnValueOnce(throwError(() => new Error('404')));
    const store = TestBed.inject(DashboardStore);
    store.load();
    await settle();

    expect(api.gathering.list).not.toHaveBeenCalled();
    expect(store.gathering()).toEqual({ loading: false, error: false, data: [] });
    // The one /employees/me answer is shared by the tasks and gathering widgets.
    expect(api.employees.getMe).toHaveBeenCalledTimes(1);
  });
});

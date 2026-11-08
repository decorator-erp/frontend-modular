import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Observable, of, throwError } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { EmployeeService } from '@modules/people';
import { PERM, PermissionsService } from '@platform/permissions';
import { AuthStore } from '@platform/auth/auth.store';
import { ProjectService } from '../data/project.service';
import type { Project } from '../model/project.model';
import { ProjectAccessStore } from './project-access.store';

/** crmp Part 2: the shared gate — claim AND myLevel AND open project, plus the caller's employee id. */
describe('ProjectAccessStore (crmp Part 2)', () => {
  function make(level: Project['myLevel'], status: Project['status'] = 'InProgress') {
    const getById = vi.fn(() =>
      of({ id: 'P1', myLevel: level, status, isActive: true } as Project),
    );
    TestBed.configureTestingModule({
      providers: [
        { provide: ProjectService, useValue: { getById } },
        { provide: EmployeeService, useValue: { getMe: () => of({ id: 'E1' }) } },
        {
          provide: PermissionsService,
          useValue: { can: (p: string) => p !== PERM.projects.delete },
        },
      ],
    });
    return { store: TestBed.inject(ProjectAccessStore), getById };
  }

  it('loads the project once and answers with permission AND level', () => {
    const { store, getById } = make('Editor');
    store.ensure('P1');
    store.ensure('P1');
    expect(getById).toHaveBeenCalledTimes(1);
    expect(store.can('P1', 'subtask.create')).toBe(true);
    expect(store.can('P1', 'stage.create')).toBe(false);
    expect(store.me()).toBe('E1');
  });

  it('a missing claim wins over a Manager level; an unknown project allows nothing', () => {
    const { store } = make('Manager');
    store.ensure('P1');
    expect(store.can('P1', 'project.delete')).toBe(false);
    expect(store.can('P1', 'project.update')).toBe(true);
    expect(store.can('P9', 'project.update')).toBe(false);
  });

  it('a closed project blocks work writes; seed() avoids a second read', () => {
    const { store, getById } = make('Manager');
    store.seed({ id: 'P2', myLevel: 'Manager', status: 'Completed', isActive: true } as Project);
    expect(getById).not.toHaveBeenCalled();
    expect(store.closed('P2')).toBe(true);
    expect(store.can('P2', 'task.create')).toBe(false);
  });

  it('task execution follows the assignee rule (TaskExecutors.cs:17-35)', () => {
    const { store } = make('Editor');
    store.ensure('P1');
    expect(store.canExecute('P1', { assignedToId: 'E1' }, 'task.start')).toBe(true);
  });

  it('R-P2-F10: an Editor who is not the assignee and lacks stage_tasks.manage cannot start', () => {
    const getById = vi.fn(() =>
      of({ id: 'P1', myLevel: 'Editor', status: 'InProgress', isActive: true } as Project),
    );
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        { provide: ProjectService, useValue: { getById } },
        { provide: EmployeeService, useValue: { getMe: () => of({ id: 'E1' }) } },
        {
          provide: PermissionsService,
          useValue: { can: (p: string) => p === PERM.stageTasks.complete },
        },
      ],
    });
    const store = TestBed.inject(ProjectAccessStore);
    store.ensure('P1');
    expect(store.canExecute('P1', { assignedToId: 'E2' }, 'task.start')).toBe(false);
    expect(store.canExecute('P1', { assignedToId: 'E1' }, 'task.start')).toBe(true);
  });

  it('R-P2-F9: a failed read is retried on the next ensure()', () => {
    let fail = true;
    const getById = vi.fn(() =>
      fail
        ? throwError(() => new Error('x'))
        : of({ id: 'P1', myLevel: 'Manager', status: 'InProgress', isActive: true } as Project),
    );
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        { provide: ProjectService, useValue: { getById } },
        { provide: EmployeeService, useValue: { getMe: () => of({ id: 'E1' }) } },
        { provide: PermissionsService, useValue: { can: () => true } },
      ],
    });
    const store = TestBed.inject(ProjectAccessStore);
    store.ensure('P1');
    expect(store.project('P1')()).toBeNull();
    fail = false;
    store.ensure('P1');
    expect(getById).toHaveBeenCalledTimes(2);
    expect(store.can('P1', 'stage.create')).toBe(true);
  });

  // Review B5 (CP-6): a root singleton must not carry one user's employee id or levels into the next login.
  describe('review B5 — auth change', () => {
    function makeWithAuth(getMe: () => Observable<unknown>) {
      const user = signal<{ userId: string } | null>({ userId: 'U1' });
      const getById = vi.fn(() =>
        of({ id: 'P1', myLevel: 'Manager', status: 'InProgress', isActive: true } as Project),
      );
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        providers: [
          { provide: ProjectService, useValue: { getById } },
          { provide: EmployeeService, useValue: { getMe: vi.fn(getMe) } },
          { provide: PermissionsService, useValue: { can: () => true } },
          { provide: AuthStore, useValue: { user } },
        ],
      });
      const store = TestBed.inject(ProjectAccessStore);
      TestBed.tick();
      return { store, user, getById, employees: TestBed.inject(EmployeeService) };
    }

    it('logout clears the cached projects and the employee id; the next user reads them again', () => {
      let id = 'E1';
      const { store, user, getById, employees } = makeWithAuth(() => of({ id }));
      store.ensure('P1');
      expect(store.me()).toBe('E1');
      expect(store.can('P1', 'stage.create')).toBe(true);

      user.set(null);
      TestBed.tick();
      expect(store.me()).toBeNull();
      expect(store.project('P1')()).toBeNull();
      expect(store.can('P1', 'stage.create')).toBe(false);

      id = 'E2';
      user.set({ userId: 'U2' });
      TestBed.tick();
      store.ensure('P1');
      expect(getById).toHaveBeenCalledTimes(2);
      expect(employees.getMe).toHaveBeenCalledTimes(2);
      expect(store.me()).toBe('E2');
    });

    it('a failed /employees/me read is tried again on the next ensure()', () => {
      let fail = true;
      const { store, employees } = makeWithAuth(() =>
        fail ? throwError(() => new Error('down')) : of({ id: 'E1' }),
      );
      store.ensure('P1');
      expect(store.me()).toBeNull();
      fail = false;
      store.ensure('P1');
      expect(employees.getMe).toHaveBeenCalledTimes(2);
      expect(store.me()).toBe('E1');
    });
  });
});

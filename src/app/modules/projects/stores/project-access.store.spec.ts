import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { EmployeeService } from '@modules/people';
import { PERM, PermissionsService } from '@platform/permissions';
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
});

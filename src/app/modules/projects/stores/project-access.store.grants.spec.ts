import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { describe, expect, it } from 'vitest';
import { EmployeeService } from '@modules/people';
import { PermissionsService } from '@platform/permissions';
import { ProjectService } from '../data/project.service';
import type { Project } from '../model/project.model';
import type { ProjectAccess } from '../model/access-grant.model';
import { ProjectAccessStore } from './project-access.store';

/** crmp P1-B: the shared gate reads `myAccess`; a grantee's token holds no implied codes. */
describe('ProjectAccessStore — grants (crmp P1-B)', () => {
  function make(myAccess: ProjectAccess | null) {
    TestBed.configureTestingModule({
      providers: [
        { provide: ProjectService, useValue: { getById: () => of(null) } },
        { provide: EmployeeService, useValue: { getMe: () => of({ id: 'E1' }) } },
        // The grantee's token: no project codes at all.
        { provide: PermissionsService, useValue: { can: () => false } },
      ],
    });
    const store = TestBed.inject(ProjectAccessStore);
    store.seed({
      id: 'P1',
      myLevel: myAccess?.level ?? 'Viewer',
      status: 'InProgress',
      isActive: true,
      myAccess,
    } as Project);
    return store;
  }

  const stageGrant: ProjectAccess = {
    source: 'Grant',
    level: 'Editor',
    areas: ['Overview', 'StagesAndTasks', 'Documents'],
    stageIds: ['S1'],
    expiresAtUtc: '2026-12-01T10:00:00Z',
  };

  it('can() honours area, stage and the implied table', () => {
    const store = make(stageGrant);
    expect(store.can('P1', 'task.complete', 'S1')).toBe(true);
    expect(store.can('P1', 'task.complete', 'S2')).toBe(false);
    expect(store.can('P1', 'task.complete')).toBe(false);
    expect(store.can('P1', 'member.add', 'S1')).toBe(false);
    expect(store.canExecute('P1', { assignedToId: 'E1' }, 'task.start', 'S1')).toBe(true);
    expect(store.canComment('P1', { employeeId: 'X' }, 'comment.edit', 'S2')).toBe(false);
  });

  it('covers() and claim() answer per area and stage; grant() exposes the access', () => {
    const store = make(stageGrant);
    expect(store.covers('P1', 'Overview')).toBe(true);
    expect(store.covers('P1', 'Documents')).toBe(false);
    expect(store.covers('P1', 'Documents', 'S1')).toBe(true);
    expect(store.covers('P1', 'Sites')).toBe(false);
    expect(store.covers('P1', 'StagesAndTasks', 'S2')).toBe(false);
    expect(store.claim('P1', 'Documents', 'documents.upload', 'S1')).toBe(true);
    expect(store.claim('P1', 'Documents', 'documents.delete', 'S1')).toBe(false);
    expect(store.grant('P1')?.stageIds).toEqual(['S1']);
  });

  it('a member is covered everywhere and claims come from the token', () => {
    const store = make({
      source: 'Member',
      level: 'Manager',
      areas: [],
      stageIds: [],
      expiresAtUtc: null,
    });
    expect(store.covers('P1', 'Sites')).toBe(true);
    expect(store.claim('P1', 'Sites', 'sites.read')).toBe(false);
    expect(store.grant('P1')).toBeNull();
  });

  it('an unloaded project covers nothing', () => {
    const store = make(null);
    expect(store.covers('P9', 'Overview')).toBe(false);
  });
});

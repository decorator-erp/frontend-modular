import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PermissionsService } from '@platform/permissions';
import { EmployeeService } from '../../data/employee.service';
import { LookupCache } from '../../data/lookup.cache';
import { ProfileComponent } from './profile.component';

/** Sync W1-13: /employees/me/projects|tasks do not exist — the tabs never request them. */
describe('ProfileComponent — projects/tasks tabs (sync W1-13)', () => {
  const api = {
    getMe: vi.fn(() => of({ id: 'e-1', fullName: 'Mona', primaryDepartmentId: null })),
    getMineProjects: vi.fn(() => of([])),
    getMineTasks: vi.fn(() => of([])),
  };

  beforeEach(() => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
      })),
    );
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: EmployeeService, useValue: api },
        { provide: LookupCache, useValue: { departments: () => of([]) } },
        { provide: PermissionsService, useValue: { can: () => true } },
      ],
    });
  });

  afterEach(() => vi.unstubAllGlobals());

  it('shows the unavailable state without requesting the missing routes', () => {
    const c = TestBed.createComponent(ProfileComponent).componentInstance;
    c.setTab('projects');
    c.setTab('tasks');
    expect(api.getMineProjects).not.toHaveBeenCalled();
    expect(api.getMineTasks).not.toHaveBeenCalled();
    expect(c.projectsUnavailable()).toBe(true);
    expect(c.tasksUnavailable()).toBe(true);
  });
});

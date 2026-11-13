import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { CommandPaletteService } from '@ds';
import { ProjectSearchService } from '@modules/projects';
import { PERM, PermissionsService } from '@platform/permissions';
import { GlobalActionsSource, ProjectsCommandSource } from './palette-sources';

/** UI-1: the command palette offers only what the caller may open. */
describe('palette sources — permission filtering (UI-1)', () => {
  function setup(held: string[]) {
    const search = vi.fn(() => of({ items: [], totalCount: 0 }));
    TestBed.configureTestingModule({
      providers: [
        { provide: Router, useValue: { navigateByUrl: vi.fn(), navigate: vi.fn() } },
        { provide: CommandPaletteService, useValue: { register: vi.fn(), unregister: vi.fn() } },
        { provide: ProjectSearchService, useValue: { search } },
        {
          provide: PermissionsService,
          useValue: { can: (p: string) => held.includes(p), canAll: () => false },
        },
      ],
    });
    return { search };
  }

  it('hides global actions the caller lacks the permission for', () => {
    setup([PERM.employees.read]);
    const labels = TestBed.inject(GlobalActionsSource)
      .search('')
      .map((i) => i.label);
    expect(labels).toContain('Browse employees');
    expect(labels).toContain('Open dashboard');
    expect(labels).toContain('My profile');
    expect(labels).not.toContain('New project');
    expect(labels).not.toContain('Open finance studio');
    expect(labels).not.toContain('Open audit log');
  });

  it('does not search projects without project.read', () => {
    const { search } = setup([]);
    expect(TestBed.inject(ProjectsCommandSource).search('a')).toEqual([]);
    expect(search).not.toHaveBeenCalled();
  });

  it('searches projects with project.read', () => {
    const { search } = setup([PERM.projects.read]);
    TestBed.inject(ProjectsCommandSource);
    expect(search).toHaveBeenCalled();
  });
});

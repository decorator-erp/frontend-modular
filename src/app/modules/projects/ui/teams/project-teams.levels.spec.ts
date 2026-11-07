import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { describe, expect, it } from 'vitest';
import { ConfirmService, ModalService } from '@ds';
import { DepartmentService, EmployeeService } from '@modules/people';
import { PERM, PermissionsService } from '@platform/permissions';
import { StageTeamsService } from '../../data/stage-teams.service';
import { ProjectAction, ProjectLevel, canProjectAction } from '../../model/project-actions';
import { ProjectAccessStore } from '../../stores/project-access.store';
import { ProjectTeamsComponent } from '../project-teams.component';

const team = {
  id: 'TM1',
  departmentId: 'D1',
  departmentName: 'Design',
  projectStageId: 'S1',
  stageId: null,
  headId: 'E1',
  headName: 'Hany',
  memberCount: 1,
  members: [{ id: 'M1', employeeId: 'E1', employeeName: 'Hany', isHead: true, role: 'Lead' }],
};

/** crmp P-7: team writes need stage_teams.manage AND the Manager level. */
describe('ProjectTeamsComponent — levels (crmp P-7)', () => {
  function render(level: ProjectLevel) {
    const grants = new Set<string>([PERM.stageTeams.manage, PERM.stages.read]);
    TestBed.configureTestingModule({
      imports: [ProjectTeamsComponent],
      providers: [
        { provide: StageTeamsService, useValue: { getByProject: () => of([team]) } },
        { provide: EmployeeService, useValue: { listPaged: () => of({ items: [] }) } },
        { provide: DepartmentService, useValue: { getAll: () => of([]) } },
        {
          provide: ModalService,
          useValue: { open: () => ({ afterClosed: () => Promise.resolve(false) }) },
        },
        { provide: ConfirmService, useValue: { open: () => Promise.resolve(false) } },
        {
          provide: PermissionsService,
          useValue: {
            can: (p: string | string[]) => (Array.isArray(p) ? p : [p]).some((x) => grants.has(x)),
          },
        },
        {
          provide: ProjectAccessStore,
          useValue: {
            ensure: () => undefined,
            can: (_id: string, a: ProjectAction) =>
              canProjectAction({ myLevel: level, status: 'InProgress', isActive: true }, a, (p) =>
                grants.has(p),
              ),
          },
        },
      ],
    });
    const f = TestBed.createComponent(ProjectTeamsComponent);
    f.componentRef.setInput('projectId', 'P1');
    f.detectChanges();
    f.detectChanges();
    return f.componentInstance;
  }

  it.each([
    ['Viewer', false],
    ['Editor', false],
    ['Manager', true],
  ] as const)('%s: team writes allowed = %s', (level, allowed) => {
    const c = render(level);
    expect(c.teamCan('team.create')).toBe(allowed);
    expect(c.teamCan('team.removeMember')).toBe(allowed);
    expect(c.tabDefs().some((t) => t.id === '__new__')).toBe(allowed);
  });
});

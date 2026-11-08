import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { of, throwError } from 'rxjs';
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

  // Review B6 (CP-7): a failed list read is an error with Retry, an unknown project a not-found state.
  describe('review B6 — error and not-found states', () => {
    function renderFailing(status: number) {
      let calls = 0;
      TestBed.configureTestingModule({
        imports: [ProjectTeamsComponent],
        providers: [
          {
            provide: StageTeamsService,
            useValue: {
              getByProject: () => {
                calls++;
                return calls === 1
                  ? throwError(() => new HttpErrorResponse({ status }))
                  : of([team]);
              },
            },
          },
          { provide: EmployeeService, useValue: { listPaged: () => of({ items: [] }) } },
          { provide: DepartmentService, useValue: { getAll: () => of([]) } },
          { provide: ModalService, useValue: { open: () => undefined } },
          { provide: ConfirmService, useValue: { open: () => Promise.resolve(false) } },
          { provide: PermissionsService, useValue: { can: () => true } },
          { provide: ProjectAccessStore, useValue: { ensure: () => undefined, can: () => false } },
        ],
      });
      const f = TestBed.createComponent(ProjectTeamsComponent);
      f.componentRef.setInput('projectId', 'P1');
      f.detectChanges();
      f.detectChanges();
      return { f, el: f.nativeElement as HTMLElement, calls: () => calls };
    }

    it('404: the not-found state, not "No stage teams yet"', () => {
      const { el } = renderFailing(404);
      expect(el.querySelector('[data-not-found]')).toBeTruthy();
      expect(el.textContent).not.toContain('No stage teams yet');
    });

    it('any other failure: an error alert whose Retry loads again', () => {
      const { f, el, calls } = renderFailing(500);
      const alert = el.querySelector('[data-load-error]');
      expect(alert).toBeTruthy();
      expect(el.textContent).not.toContain('No stage teams yet');
      (alert?.querySelector('button') as HTMLButtonElement).click();
      f.detectChanges();
      expect(calls()).toBe(2);
      expect(el.querySelector('[data-load-error]')).toBeNull();
    });
  });
});

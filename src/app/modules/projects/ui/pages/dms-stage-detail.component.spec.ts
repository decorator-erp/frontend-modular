import { NO_ERRORS_SCHEMA } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { of } from 'rxjs';
import { DmsStageDetailComponent } from './dms-stage-detail.component';
import { ProjectStageService } from '../../data/project-stage.service';
import { StageGateConditionService } from '../../data/stage-gate-condition.service';
import { ProjectService } from '../../data/project.service';
import { StageTeamsService } from '../../data/stage-teams.service';
import { StageLifecycleService } from '../../data/stage-lifecycle.service';
import { EmployeeService } from '@modules/people';
import { BreadcrumbService } from '@platform/navigation/breadcrumb.service';
import { ErrorHandlerService } from '@platform/http/error-handler.service';
import { ToastService } from '@platform/feedback/toast.service';
import { ConfirmService, ModalService } from '@ds';
import { PermissionsService } from '@platform/permissions';
import { PERM } from '@platform/permissions';
import { CanDirective } from '@platform/permissions';
import type {
  ProjectStage,
  ProjectTask,
  StageStatus,
  ProjectTaskStatus,
} from '../../model/project.model';

function taskOf(status: ProjectTaskStatus): ProjectTask {
  return { id: 't' + status, projectId: 'p1', status, weight: 1 } as unknown as ProjectTask;
}
function stage(status: StageStatus, statuses: ProjectTaskStatus[] = []): ProjectStage {
  return {
    id: 's1',
    projectId: 'p1',
    name: 'Design Phase',
    order: 3,
    status,
    tasks: statuses.map(taskOf),
    totalTasks: statuses.length,
    completedTasks: 0,
  } as unknown as ProjectStage;
}

describe('DmsStageDetailComponent', () => {
  let detailsCalls: number;
  let byProjectCalls: number;
  let granted: Set<string>;
  let theStage: ProjectStage;

  function providers() {
    return [
      {
        provide: ProjectStageService,
        useValue: {
          getDetails: () => {
            detailsCalls++;
            return of(theStage);
          },
          getByProject: () => {
            byProjectCalls++;
            return of([theStage]);
          },
          activate: () => of(undefined),
          complete: () => of(undefined),
          remove: () => of(undefined),
        },
      },
      { provide: StageGateConditionService, useValue: { getByStage: () => of([]) } },
      { provide: ProjectService, useValue: { getById: () => of(null) } },
      { provide: StageTeamsService, useValue: { getByProjectStage: () => of([]) } },
      {
        provide: StageLifecycleService,
        useValue: { approve: () => of(undefined), reject: () => of(undefined) },
      },
      { provide: EmployeeService, useValue: { listPaged: () => of(null) } },
      { provide: BreadcrumbService, useValue: { set: () => undefined, clear: () => undefined } },
      {
        provide: ModalService,
        useValue: { open: () => ({ afterClosed: () => Promise.resolve(undefined) }) },
      },
      { provide: ConfirmService, useValue: { open: () => Promise.resolve(false) } },
      { provide: ToastService, useValue: { show: () => undefined } },
      { provide: ErrorHandlerService, useValue: { parse: () => ({}) } },
      {
        provide: PermissionsService,
        useValue: {
          can: (k: string | string[]) => (Array.isArray(k) ? k : [k]).some((x) => granted.has(x)),
        },
      },
      {
        provide: ActivatedRoute,
        useValue: {
          paramMap: of(convertToParamMap({ projectId: 'p1', stageId: 's1' })),
          snapshot: { paramMap: convertToParamMap({ projectId: 'p1', stageId: 's1' }) },
        },
      },
      { provide: Router, useValue: { navigate: () => undefined } },
    ];
  }

  beforeEach(() => {
    detailsCalls = 0;
    byProjectCalls = 0;
    granted = new Set();
    theStage = stage('Active');
  });

  // ---- logic (no render) -----------------------------------------------------
  function makeLogic(): DmsStageDetailComponent {
    TestBed.configureTestingModule({ imports: [DmsStageDetailComponent], providers: providers() });
    return TestBed.createComponent(DmsStageDetailComponent).componentInstance;
  }

  it('blocks submit only when an Active stage has rejected or pending tasks', () => {
    const c = makeLogic();
    c.stage.set(stage('Active', ['Rejected', 'Completed']));
    expect(c.submitBlocked()).toBe(true);
    c.stage.set(stage('Active', ['Completed', 'Completed']));
    expect(c.submitBlocked()).toBe(false);
    c.stage.set(stage('Locked', ['Rejected']));
    expect(c.submitBlocked()).toBe(false);
  });

  it('reload refetches the stage details and the project stage list', () => {
    const c = makeLogic();
    detailsCalls = 0;
    byProjectCalls = 0;
    c.reload();
    expect(detailsCalls).toBeGreaterThan(0);
    expect(byProjectCalls).toBeGreaterThan(0);
  });

  // ---- render + gating -------------------------------------------------------
  function render() {
    TestBed.configureTestingModule({ imports: [DmsStageDetailComponent], providers: providers() });
    // Render child panels as inert elements; keep CanDirective so gating still runs.
    TestBed.overrideComponent(DmsStageDetailComponent, {
      set: { imports: [CanDirective], schemas: [NO_ERRORS_SCHEMA] },
    });
    const fixture = TestBed.createComponent(DmsStageDetailComponent);
    fixture.detectChanges();
    fixture.detectChanges();
    return fixture;
  }

  it('renders every read panel for a project reader', () => {
    granted = new Set([PERM.projects.read, PERM.activities.read]);
    const el = render().nativeElement as HTMLElement;
    for (const sel of [
      'app-dms-stage-stepper',
      'app-dms-stage-progress',
      'app-dms-stage-tasks',
      'app-dms-stage-files',
      'app-dms-stage-info',
      'app-dms-stage-dependencies',
      'app-dms-stage-team',
      'app-activity-feed',
    ]) {
      expect(el.querySelector(sel), sel).toBeTruthy();
    }
    // Gate to advance now opens as a floating window from a rail launcher.
    expect(el.querySelector('[data-rail-link]')?.textContent).toContain('Gate to advance');
  });

  it('hides lifecycle actions from a plain reader and never shows stage finance', () => {
    granted = new Set([PERM.projects.read, PERM.activities.read]);
    const fixture = render();
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).not.toContain('Submit for approval');
    expect(text).not.toContain('Approve stage');
    expect(text).not.toContain('Send back');
    expect(text).not.toContain('Stage finance'); // finance removed from the stage page
    expect(fixture.componentInstance.canEditStage()).toBe(false); // in-place edit gated on ManageStages
  });

  it('shows lifecycle actions for ManageStages and enables in-place editing', () => {
    granted = new Set([PERM.projects.read, PERM.stages.manage]);
    theStage = stage('Active', ['Completed']);
    const fixture = render();
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Submit for approval');
    expect(text).toContain('Approve stage');
    expect((fixture.nativeElement as HTMLElement).querySelector('[data-rail-link]')).toBeTruthy();
    expect(fixture.componentInstance.canEditStage()).toBe(true);
  });
});

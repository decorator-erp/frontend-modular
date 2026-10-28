import { NO_ERRORS_SCHEMA } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { of } from 'rxjs';
import { ProjectDetailComponent } from './project-detail.component';
import { ProjectService } from '../../data/project.service';
import { ProjectMemberService } from '../../data/project-member.service';
import { StageTeamsService } from '../../data/stage-teams.service';
import { LocaleService } from '@platform/i18n';
import { ToastService } from '@platform/feedback/toast.service';
import { ModalService, PeraEntityHeaderCardComponent } from '@ds';
import { EmployeeService } from '@modules/people';
import { ProjectDocumentsService } from '../../data/documents.service';
import { PermissionsService } from '@platform/permissions';
import { PERM } from '@platform/permissions';
import { CanDirective } from '@platform/permissions';
import { statusDistribution, priorityDistribution } from '../overview/task-distribution';
import type { ProjectDetails, ProjectStage, ProjectTask } from '../../model/project.model';

function task(over: Partial<ProjectTask>): ProjectTask {
  return {
    id: 't1',
    projectId: 'p1',
    projectStageId: 's1',
    stageTaskId: null,
    assignedToId: null,
    name: 'A task',
    description: null,
    order: 10,
    status: 'Open',
    priority: 'Medium',
    weight: 1,
    notes: null,
    estimatedStartDate: null,
    startedOnUtc: null,
    completedOnUtc: null,
    dueDate: null,
    progressPercent: 0,
    ...over,
  };
}

function details(): ProjectDetails {
  const stage: ProjectStage = {
    id: 's1',
    projectId: 'p1',
    stageId: null,
    name: 'Design Phase',
    description: null,
    order: 3,
    status: 'Active',
    nameAr: null,
    parallelGroup: null,
    progressPercent: 64,
    completedTasks: 1,
    totalTasks: 3,
    estimatedStartDate: '2026-03-17',
    estimatedEndDate: '2026-08-12',
    startedOnUtc: null,
    completedOnUtc: null,
    notes: null,
    tasks: [
      task({
        id: 'ta',
        name: 'Floor plan',
        status: 'Completed',
        priority: 'High',
        progressPercent: 100,
        dueDate: '2026-04-01',
      }),
      task({
        id: 'tb',
        name: 'Facade',
        status: 'InProgress',
        priority: 'Urgent',
        progressPercent: 40,
      }),
      task({
        id: 'tc',
        name: 'RFI 018',
        status: 'PendingApproval',
        priority: 'Low',
        progressPercent: 0,
      }),
    ],
  };
  return {
    project: {
      id: 'p1',
      trackKey: 'p1',
      code: 'MT-04',
      name: 'Marina Tower',
      status: 'InProgress',
      description: null,
      notes: null,
      workflowType: 'Stage',
      address: '',
      clientId: 'c1',
      clientName: 'Hassan Allam Holding',
      productOwnerId: 'po1',
      productOwnerName: 'Sara Mohamed',
      estimatedBudget: 0,
      progressPercentage: 42,
      startDate: '2026-02-03',
      endDate: '2026-11-22',
      actualStartDate: null,
      actualEndDate: null,
    },
    stages: [stage],
    unstagedTasks: [],
  };
}

describe('ProjectDetailComponent', () => {
  let granted: Set<string>;
  let data: ProjectDetails;
  let navCalls: unknown[][];

  function providers() {
    return [
      {
        provide: ProjectService,
        useValue: {
          getDetails: () => of(data),
          getApprovalRequests: () =>
            of([
              { projectId: 'p1', approvalType: 'ManagerApproval' },
              { projectId: 'other', approvalType: 'ManagerApproval' },
            ]),
        },
      },
      {
        provide: ProjectMemberService,
        useValue: {
          getByProject: () =>
            of([
              {
                id: 'm1',
                projectId: 'p1',
                employeeId: 'po1',
                access: 'Manager',
                canManage: true,
                canExecuteTasks: true,
              },
            ]),
        },
      },
      {
        provide: EmployeeService,
        useValue: { listPaged: () => of({ items: [{ id: 'po1', fullName: 'Sara Mohamed' }] }) },
      },
      {
        provide: StageTeamsService,
        useValue: {
          getByProject: () =>
            of([
              {
                id: 'tm1',
                projectStageId: 's1',
                headId: 'po1',
                headName: 'Sara Mohamed',
                members: [],
              },
            ]),
        },
      },
      { provide: ProjectDocumentsService, useValue: { getByProject: () => of([]) } },
      {
        provide: ModalService,
        useValue: { open: () => ({ afterClosed: () => Promise.resolve(undefined) }) },
      },
      { provide: ToastService, useValue: { show: () => undefined } },
      { provide: LocaleService, useValue: { locale: () => 'en' } },
      {
        provide: PermissionsService,
        useValue: {
          can: (k: string | string[]) => (Array.isArray(k) ? k : [k]).some((x) => granted.has(x)),
        },
      },
      {
        provide: ActivatedRoute,
        useValue: { snapshot: { paramMap: convertToParamMap({ id: 'p1' }) } },
      },
      {
        provide: Router,
        useValue: {
          navigate: (...args: unknown[]) => {
            navCalls.push(args);
          },
        },
      },
    ];
  }

  beforeEach(() => {
    granted = new Set();
    data = details();
    navCalls = [];
  });

  function render() {
    TestBed.configureTestingModule({ imports: [ProjectDetailComponent], providers: providers() });
    // Render child panels as inert elements; keep CanDirective so gating still runs,
    // and keep the header card so the header assertions below see real DOM (003 B1).
    TestBed.overrideComponent(ProjectDetailComponent, {
      set: {
        imports: [CanDirective, PeraEntityHeaderCardComponent],
        schemas: [NO_ERRORS_SCHEMA],
      },
    });
    const fixture = TestBed.createComponent(ProjectDetailComponent);
    fixture.detectChanges();
    fixture.detectChanges();
    return fixture;
  }

  const ALL = [
    PERM.projects.read,
    PERM.stageTasks.manage,
    PERM.stageTeams.manage,
    PERM.documents.upload,
    PERM.activities.read,
  ];

  // 003 Batch 1: the header is now a `pera-entity-header-card`. The `.ph-title` /
  // `.ph-meta` / `.kpis` / `.dms-st--*` vocabulary these two tests located by was
  // retired with the hand-built header (T023). The *expectations* below are
  // unchanged — only the locators moved to the primitive's DOM.
  it('renders the header with status, client, owner and planned dates', () => {
    granted = new Set(ALL);
    const el = render().nativeElement as HTMLElement;
    expect(el.querySelector('pera-entity-header-card')?.textContent).toContain('Marina Tower');
    expect(el.querySelector('pera-status-badge')?.textContent).toContain('In progress');
    const meta = el.querySelector('pera-entity-header-card')?.textContent ?? '';
    expect(meta).toContain('Hassan Allam Holding');
    expect(meta).toContain('Sara Mohamed');
    expect(meta).toContain('Feb'); // start date Feb 03
    expect(meta).toContain('Nov'); // due date Nov 22
  });

  it('derives the KPI strip — progress, task counts and open actions (this project only)', () => {
    granted = new Set(ALL);
    const fixture = render();
    const c = fixture.componentInstance;
    expect(c.totalTasks()).toBe(3);
    expect(c.doneCount()).toBe(1);
    expect(c.inProgressCount()).toBe(1);
    expect(c.openActions()).toBe(1); // filters out the 'other' project's request
    const strip = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll('pera-kpi-tile'),
    )
      .map((t) => t.textContent ?? '')
      .join(' ');
    expect(strip).toContain('42'); // progressPercentage
  });

  // 003 Batch 4a: the ported `.pn-head` / `.ttl` / `.stl-head` / `.empty` class
  // vocabulary was deleted with the styles block (T057-T059). These four tests kept
  // every expectation and moved their locators onto stable `data-*` hooks.
  it('renders the panels in the design section order', () => {
    granted = new Set(ALL);
    const el = render().nativeElement as HTMLElement;
    const titles = Array.from(el.querySelectorAll('[data-panel-head] h3')).map((h) =>
      h.textContent?.trim(),
    );
    expect(titles).toEqual([
      'Stage timeline',
      'Stages & tasks',
      'Task status',
      'Task priority',
      'Activity',
      'Team',
      'Documents',
      'Risk register',
    ]);
  });

  it('flips the Stages & tasks panel between list and gantt', () => {
    granted = new Set(ALL);
    const fixture = render();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('[data-stl-head]')).toBeTruthy();
    expect(el.querySelector('app-tasks-gantt-view')).toBeFalsy();
    fixture.componentInstance.stView.set('gantt');
    fixture.detectChanges();
    expect(el.querySelector('[data-stl-head]')).toBeFalsy();
    expect(el.querySelector('app-tasks-gantt-view')).toBeTruthy();
  });

  it('shows a dash for a task with no due/end dates rather than a fabricated value', () => {
    granted = new Set(ALL);
    const c = render().componentInstance;
    expect(c.taskDue(task({ dueDate: null, completedOnUtc: null }))).toBe('—');
    expect(c.taskDue(task({ dueDate: '2026-04-01' }))).not.toBe('—');
  });

  it('navigates to the task route when a task row is opened', () => {
    granted = new Set(ALL);
    const fixture = render();
    fixture.componentInstance.openTask(task({ id: 'tb' }));
    expect(navCalls).toContainEqual([['/projects', 'p1', 'tasks', 'tb']]);
  });

  it('offers Requirement gathering only with the CRM dashboard permission', () => {
    // The CRM workspace is otherwise unreachable from a project: the sidebar's Projects
    // entry lands here, and nothing else links to /crm/projects/:id.
    granted = new Set([...ALL, PERM.crm.periods.read]);
    const fixture = render();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Requirement gathering');

    fixture.componentInstance.openRequirementGathering();
    expect(navCalls).toContainEqual([['/crm/projects', 'p1']]);
  });

  it('hides Requirement gathering when the CRM dashboard route would reject the user', () => {
    // Hidden, never disabled — a click must not land on a 403.
    granted = new Set(ALL);
    const el = render().nativeElement as HTMLElement;
    expect(el.textContent).not.toContain('Requirement gathering');
  });

  it('feeds both donuts from the task distribution helpers', () => {
    granted = new Set(ALL);
    const c = render().componentInstance;
    expect(c.statusSegments()).toEqual(statusDistribution(c.allTasks()));
    expect(c.prioritySegments()).toEqual(priorityDistribution(c.allTasks()));
  });

  it('hides New task without ManageTasks and the Documents panel without ManageDocuments', () => {
    granted = new Set([PERM.projects.read, PERM.activities.read]); // reader, no manage
    const el = render().nativeElement as HTMLElement;
    expect(el.textContent).not.toContain('New task');
    const titles = Array.from(el.querySelectorAll('[data-panel-head] h3')).map((h) =>
      h.textContent?.trim(),
    );
    expect(titles).not.toContain('Documents');
    // the read panels still render
    expect(titles).toContain('Stages & tasks');
    expect(titles).toContain('Team');
  });

  it('derives the stage-row owner from the stage-team head (— when no team)', () => {
    granted = new Set(ALL);
    const c = render().componentInstance;
    expect(c.stageOwner('s1')).toBe('Sara Mohamed'); // resolved via the head id
    expect(c.stageOwner('no-team')).toBe(''); // template falls back to —
  });

  it('renders the risk register empty state without asserting unknown project health', () => {
    granted = new Set(ALL);
    const el = render().nativeElement as HTMLElement;
    expect(el.querySelector('[data-risk-empty] [data-empty-title]')?.textContent).toContain(
      'No open risks logged',
    );
    const sub = el.querySelector('[data-risk-empty] [data-empty-sub]')?.textContent ?? '';
    expect(sub).toContain('Capture delivery threats');
    // must NOT fabricate schedule/budget health it can't know
    expect(sub).not.toContain('clean schedule');
    expect(sub).not.toContain('Marina Tower');
  });
});

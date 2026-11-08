import { NO_ERRORS_SCHEMA, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  ActivatedRoute,
  Router,
  RouterLink,
  convertToParamMap,
  provideRouter,
} from '@angular/router';
import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { environment } from '../../../../../environments/environment';
import { Observable, of, throwError } from 'rxjs';
import { ProjectDetailComponent } from './project-detail.component';
import { ProjectService } from '../../data/project.service';
import { ProjectMemberService } from '../../data/project-member.service';
import { StageTeamsService } from '../../data/stage-teams.service';
import { LocaleService } from '@platform/i18n';
import { ToastService } from '@platform/feedback/toast.service';
import { ModalService, PeraEntityHeaderCardComponent } from '@ds';
import { EmployeeService } from '@modules/people';
import { ScopeOfWorkService } from '../../data/scope-of-work.service';
import { ScopeOfWorkStatus } from '../../model/scope-of-work.model';

let scopeStatus: ScopeOfWorkStatus = ScopeOfWorkStatus.Confirmed;
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
    myLevel: 'Manager',
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
      stageCount: 1,
      isActive: true,
      myLevel: 'Manager',
    },
    stages: [stage],
    unstagedTasks: [],
    taskCounts: [],
    gates: { total: 0, pending: 0, satisfied: 0, rejected: 0 },
  };
}

describe('ProjectDetailComponent', () => {
  let granted: Set<string>;
  let data: ProjectDetails;
  let navCalls: unknown[][];
  let detailsCalls: number;
  let detailsResponse: () => Observable<ProjectDetails>;

  function providers() {
    return [
      {
        provide: ProjectService,
        useValue: {
          getDetails: () => {
            detailsCalls++;
            return detailsResponse();
          },
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
        useValue: {
          listPaged: () => of({ items: [{ id: 'po1', fullName: 'Sara Mohamed' }] }),
          getMe: () => of({ id: 'po1' }),
        },
      },
      // crmp P-2: the page reads the scope of work to decide whether stages can be added by hand.
      { provide: ScopeOfWorkService, useValue: { getScope: () => of({ status: scopeStatus }) } },
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
      { provide: LocaleService, useValue: { locale: signal<'en' | 'ar'>('en') } },
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
    detailsCalls = 0;
    detailsResponse = () => of(data);
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

  it('sites (NEW-FEATURE-1): the "Site surveys" link renders with sites.read only', () => {
    granted = new Set(ALL);
    let el = render().nativeElement as HTMLElement;
    expect(el.querySelector('[data-sites-link]')).toBeNull();
    TestBed.resetTestingModule();
    granted = new Set([...ALL, 'sites.read']);
    el = render().nativeElement as HTMLElement;
    expect(el.querySelector('[data-sites-link]')?.textContent).toContain('Site surveys');
  });

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

  it('derives the KPI strip — progress and task counts; no Open actions KPI (crm-prod B2-fe: no backend route)', () => {
    granted = new Set(ALL);
    const fixture = render();
    const c = fixture.componentInstance;
    expect(c.totalTasks()).toBe(3);
    expect(c.doneCount()).toBe(1);
    expect(c.inProgressCount()).toBe(1);
    expect(c.headerKpis().map((k) => k.caption)).toEqual(['Progress', 'Tasks', 'Days remaining']);
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

  // sow #10 (specs/sow-scope-of-work.md §3): the scope-of-work entry point. FINDING-7-8: a
  // RouterLink anchor, so these render with a real router and RouterLink kept.
  function renderWithRouter() {
    TestBed.configureTestingModule({
      imports: [ProjectDetailComponent],
      providers: [
        ...providers().filter((p) => !('provide' in p) || p.provide !== Router),
        provideRouter([]),
      ],
    });
    TestBed.overrideComponent(ProjectDetailComponent, {
      set: {
        imports: [CanDirective, PeraEntityHeaderCardComponent, RouterLink],
        schemas: [NO_ERRORS_SCHEMA],
      },
    });
    const fixture = TestBed.createComponent(ProjectDetailComponent);
    fixture.detectChanges();
    fixture.detectChanges();
    return fixture;
  }

  const scopeLink = (el: HTMLElement) =>
    Array.from(el.querySelectorAll<HTMLAnchorElement>('a')).find(
      (a) => a.textContent!.trim() === 'Scope of work',
    );

  it('sow #10: links to the scope of work for a Stage project with scope.read', () => {
    granted = new Set([...ALL, PERM.scope.read]);
    const link = scopeLink(renderWithRouter().nativeElement as HTMLElement);
    expect(link).toBeDefined();
    expect(link!.getAttribute('href')).toBe('/projects/p1/scope-of-work');
  });

  it('sow #10: no scope-of-work link without scope.read', () => {
    granted = new Set(ALL);
    expect(scopeLink(renderWithRouter().nativeElement as HTMLElement)).toBeUndefined();
  });

  it('sow #10: no scope-of-work link on a FreeStyle project', () => {
    granted = new Set([...ALL, PERM.scope.read]);
    data = { ...data, project: { ...data.project, workflowType: 'FreeStyle' } };
    expect(scopeLink(renderWithRouter().nativeElement as HTMLElement)).toBeUndefined();
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

  // crm-prod B2-fe part 2: the real ProjectService against a payload in the backend's shape
  // (dms Projects.Contracts/Projects/ProjectContracts.cs:57-85, Tasks/TaskContracts.cs:5-8), and
  // the page's real child components — no inert overrides.
  describe('end to end with a GET /details payload (crm-prod B2-fe part 2)', () => {
    const wireTask = (over: Record<string, unknown>) => ({
      id: 't',
      projectId: 'p1',
      projectStageId: 's1',
      name: 'Task',
      description: null,
      order: 10,
      status: 2,
      priority: 2,
      weight: 1,
      assignedToId: null,
      departmentId: null,
      dueDate: null,
      cost: null,
      ...over,
    });
    const payload = {
      project: {
        id: 'p1',
        code: 'MT-04',
        name: 'Marina Tower',
        description: null,
        status: 2,
        workflowType: 1,
        address: 'New Cairo',
        notes: null,
        progressPercentage: 42,
        estimatedStartDate: '2026-02-03T00:00:00',
        estimatedEndDate: '2026-11-22T00:00:00',
        actualStartDate: null,
        actualEndDate: null,
        clientId: 'c1',
        clientName: 'Hassan Allam Holding',
        ownerId: 'po1',
        isActive: true,
        stageCount: 1,
      },
      stages: [
        {
          id: 's1',
          projectId: 'p1',
          stageId: null,
          name: 'Design Phase',
          description: null,
          order: 3,
          status: 2,
          progressPercent: 50,
          completedTasks: 1,
          totalTasks: 2,
          cost: null,
          estimatedStartDate: '2026-03-17T00:00:00',
          estimatedEndDate: '2026-08-12T00:00:00',
          actualStartDate: '2026-03-18T00:00:00',
          actualEndDate: null,
          notes: null,
          tasks: [
            wireTask({ id: 'ta', name: 'Floor plan', status: 4, priority: 3, assignedToId: 'po1' }),
            wireTask({ id: 'tb', name: 'Facade', order: 20, status: 7, priority: 4 }),
          ],
          taskCounts: [
            { status: 4, count: 1 },
            { status: 7, count: 1 },
          ],
          gates: { total: 2, pending: 1, satisfied: 1, rejected: 0 },
        },
      ],
      unstagedTasks: [],
      taskCounts: [
        { status: 4, count: 1 },
        { status: 7, count: 1 },
      ],
      gates: { total: 2, pending: 1, satisfied: 1, rejected: 0 },
    };

    function renderE2E() {
      TestBed.configureTestingModule({
        imports: [ProjectDetailComponent],
        providers: [
          // The router first, so the mocked ActivatedRoute below (id = p1) wins over its own.
          provideRouter([]),
          ...providers().filter(
            (p) => !('provide' in p) || (p.provide !== ProjectService && p.provide !== Router),
          ),
          provideHttpClient(),
          provideHttpClientTesting(),
        ],
      });
      const fixture = TestBed.createComponent(ProjectDetailComponent);
      fixture.detectChanges();
      const http = TestBed.inject(HttpTestingController);
      http.expectOne(`${environment.apiUrl}/projects/p1/details`).flush(payload);
      fixture.detectChanges();
      fixture.detectChanges();
      return fixture;
    }

    it('FINDING-P2-8: the Gates KPI is catalogued in EN and AR', () => {
      const fixture = renderE2E();
      const c = fixture.componentInstance;
      TestBed.inject(LocaleService).locale.set('ar');
      fixture.detectChanges();
      expect(c.headerKpis()[3]).toMatchObject({
        caption: 'البوابات',
        value: 1,
        frac: 'معلّقة من 2',
      });
    });

    it('renders header, KPIs, stages and tasks from the backend shape', () => {
      granted = new Set([...ALL, PERM.scope.read]);
      const fixture = renderE2E();
      const c = fixture.componentInstance;
      const el = fixture.nativeElement as HTMLElement;

      const header = el.querySelector('pera-entity-header-card')?.textContent ?? '';
      expect(header).toContain('Marina Tower');
      expect(header).toContain('Hassan Allam Holding'); // clientName
      expect(header).toContain('Sara Mohamed'); // ownerId → employee directory
      expect(header).toContain('Feb'); // estimatedStartDate
      expect(header).toContain('Nov'); // estimatedEndDate
      expect(c.headerKpis().map((k) => k.caption)).toEqual([
        'Progress',
        'Tasks',
        'Days remaining',
        'Gates',
      ]);
      expect(c.headerKpis()[3]).toMatchObject({ value: 1, frac: 'pending of 2' });

      expect(c.stages().map((s) => [s.id, s.status])).toEqual([['s1', 'Active']]);
      expect(c.totalTasks()).toBe(2);
      expect(c.doneCount()).toBe(1);
      const text = el.textContent ?? '';
      expect(text).toContain('Design Phase');
      expect(text).toContain('Floor plan');
      expect(text).toContain('Facade');
      expect(text).toContain('Cancelled'); // status 7, not mis-read as To do
      // Fields with no backend source render as dashes, never as "undefined" / "NaN" / a fake 0%.
      expect(text).not.toContain('undefined');
      expect(text).not.toContain('NaN');
      expect(c.taskProgress(c.stages()[0].tasks[0])).toBe('—');

      const scope = Array.from(el.querySelectorAll<HTMLAnchorElement>('a')).find(
        (a) => a.textContent!.trim() === 'Scope of work',
      );
      expect(scope?.getAttribute('href')).toBe('/projects/p1/scope-of-work');
    });

    it('a 404 from /details lands on the not-found state', () => {
      granted = new Set(ALL);
      TestBed.configureTestingModule({
        imports: [ProjectDetailComponent],
        providers: [
          // The router first, so the mocked ActivatedRoute below (id = p1) wins over its own.
          provideRouter([]),
          ...providers().filter(
            (p) => !('provide' in p) || (p.provide !== ProjectService && p.provide !== Router),
          ),
          provideHttpClient(),
          provideHttpClientTesting(),
        ],
      });
      const fixture = TestBed.createComponent(ProjectDetailComponent);
      fixture.detectChanges();
      TestBed.inject(HttpTestingController)
        .expectOne(`${environment.apiUrl}/projects/p1/details`)
        .flush(null, { status: 404, statusText: 'Not Found' });
      fixture.detectChanges();
      expect(fixture.componentInstance.loadError()).toBe('notFound');
      expect(
        (fixture.nativeElement as HTMLElement).querySelector('[data-load-state="not-found"]'),
      ).not.toBeNull();
    });
  });

  describe('load states (crm-prod B2-fe)', () => {
    it('shows the not-found state, not a blank page, when the project load answers 404', () => {
      granted = new Set(ALL);
      detailsResponse = () => throwError(() => new HttpErrorResponse({ status: 404 }));
      const fixture = render();
      const el = fixture.nativeElement as HTMLElement;
      expect(fixture.componentInstance.loadError()).toBe('notFound');
      expect(el.querySelector('[data-load-state="not-found"]')).not.toBeNull();
      expect(el.querySelector('[data-load-state="error"]')).toBeNull();
      expect(el.querySelector('pera-entity-header-card')).toBeNull();
    });

    it('shows the error state on any other failure, and Retry loads again', () => {
      granted = new Set(ALL);
      detailsResponse = () => throwError(() => new HttpErrorResponse({ status: 500 }));
      const fixture = render();
      const el = fixture.nativeElement as HTMLElement;
      expect(fixture.componentInstance.loadError()).toBe('error');
      expect(el.querySelector('[data-load-state="error"]')).not.toBeNull();
      expect(detailsCalls).toBe(1);

      detailsResponse = () => of(data);
      fixture.componentInstance.retryLoad();
      fixture.detectChanges();
      expect(detailsCalls).toBe(2);
      expect(fixture.componentInstance.loadError()).toBeNull();
      expect(el.querySelector('[data-load-state="error"]')).toBeNull();
      expect(el.querySelector('pera-entity-header-card')?.textContent).toContain('Marina Tower');
    });
  });

  // crmp P-2 (D2): "New stage" needs stages.manage AND myLevel Manager AND a confirmed scope.
  describe('crmp P-2 — manual stages after scope confirm', () => {
    afterEach(() => (scopeStatus = ScopeOfWorkStatus.Confirmed));

    it('a Manager with stages.manage on a confirmed Stage project sees New stage', () => {
      granted = new Set([...ALL, PERM.stages.manage]);
      const el = render().nativeElement as HTMLElement;
      expect(el.querySelector('[data-new-stage]')).toBeTruthy();
      expect(el.querySelector('[data-scope-not-confirmed]')).toBeNull();
    });

    it.each(['Viewer', 'Editor'] as const)('%s never sees New stage', (level) => {
      granted = new Set([...ALL, PERM.stages.manage]);
      data = { ...data, myLevel: level, project: { ...data.project, myLevel: level } };
      const el = render().nativeElement as HTMLElement;
      expect(el.querySelector('[data-new-stage]')).toBeNull();
      expect(el.querySelector('[data-scope-not-confirmed]')).toBeNull();
    });

    it('before the scope is confirmed: no New stage, the backend reason and the scope link instead', () => {
      scopeStatus = ScopeOfWorkStatus.Draft;
      data = { ...data, stages: [] };
      granted = new Set([...ALL, PERM.stages.manage]);
      const el = render().nativeElement as HTMLElement;
      expect(el.querySelector('[data-new-stage]')).toBeNull();
      expect(el.querySelector('[data-scope-not-confirmed]')?.textContent).toContain(
        'scope of work is confirmed',
      );
    });

    it('B3 (CP-4): a project that already has stages (built from a template) takes New stage without a confirmed scope (ManualStageHandlers.cs:63-71)', () => {
      scopeStatus = ScopeOfWorkStatus.Draft;
      granted = new Set([...ALL, PERM.stages.manage]);
      const el = render().nativeElement as HTMLElement;
      expect(el.querySelector('[data-new-stage]')).toBeTruthy();
      expect(el.querySelector('[data-scope-not-confirmed]')).toBeNull();
    });
  });

  // crmp P-9: project lifecycle — claim AND Manager level; closed projects show the read-only banner.
  describe('crmp P-9 — project lifecycle', () => {
    const LIFECYCLE = [PERM.projects.changeStatus, PERM.projects.setActive, PERM.projects.delete];

    it('a Manager with the claims sees change status, deactivate and delete', () => {
      granted = new Set([...ALL, ...LIFECYCLE]);
      const el = render().nativeElement as HTMLElement;
      expect(el.querySelector('[data-change-status]')).toBeTruthy();
      expect(el.querySelector('[data-toggle-active]')?.textContent).toContain('Deactivate');
      expect(el.querySelector('[data-delete-project]')).toBeTruthy();
    });

    it.each(['Viewer', 'Editor'] as const)('%s sees no lifecycle action', (level) => {
      granted = new Set([...ALL, ...LIFECYCLE]);
      data = { ...data, myLevel: level, project: { ...data.project, myLevel: level } };
      const el = render().nativeElement as HTMLElement;
      expect(
        el.querySelector('[data-change-status], [data-toggle-active], [data-delete-project]'),
      ).toBeNull();
    });

    it('a Completed project shows the read-only banner and hides New stage', () => {
      granted = new Set([...ALL, ...LIFECYCLE, PERM.stages.manage]);
      data = { ...data, project: { ...data.project, status: 'Completed' } };
      const el = render().nativeElement as HTMLElement;
      expect(el.querySelector('app-project-closed-banner')).toBeTruthy(); // inert here; its own spec renders it
      expect(el.querySelector('[data-new-stage]')).toBeNull();
      expect(el.querySelector('[data-change-status]')).toBeTruthy();
    });
  });
});

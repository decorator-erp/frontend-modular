import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { environment } from '../../../../environments/environment';
import { ERROR_MESSAGES, ERROR_MESSAGES_AR } from '@platform/errors/error-catalog';
import { HANDLED_ERROR_STATUSES } from '@platform/http/handled-errors';
import type { CreateProjectRequest, ProjectDetails } from '../model/project.model';
import { ProjectService } from './project.service';

describe('ProjectService', () => {
  let service: ProjectService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(ProjectService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  describe('normalizeProject — stageCount (008b #3)', () => {
    it('reads ProjectResponse.StageCount', () => {
      expect(service.normalizeProject({ id: 'p', stageCount: 3 }).stageCount).toBe(3);
    });

    it('defaults to 0 when the field is absent', () => {
      expect(service.normalizeProject({ id: 'p' }).stageCount).toBe(0);
    });
  });

  describe('normalizeProject — isActive (008b #4)', () => {
    it('reads ProjectResponse.IsActive = false (an inactive project is still returned by GET /projects/{id})', () => {
      expect(service.normalizeProject({ id: 'p', isActive: false }).isActive).toBe(false);
    });

    it('defaults to true when the field is absent', () => {
      expect(service.normalizeProject({ id: 'p' }).isActive).toBe(true);
    });
  });

  describe('create (008b #2) — POST /api/projects → 200 { projectId }', () => {
    const req: CreateProjectRequest = {
      code: 'PRJ-7',
      name: 'Villa 7',
      address: 'New Cairo',
      clientId: 'c1',
      workflowType: 'FreeStyle',
      stageTemplateId: null,
      estimatedStartDate: '2026-11-01',
      estimatedEndDate: null,
    };

    it('sends CreateProjectCommand (code, int workflowType, estimated* dates; no status/budget) and emits the projectId string', () => {
      let id: unknown;
      service.create(req).subscribe((r) => (id = r));

      const call = http.expectOne(`${environment.apiUrl}/projects`);
      expect(call.request.method).toBe('POST');
      expect(call.request.body).toEqual({
        code: 'PRJ-7',
        name: 'Villa 7',
        address: 'New Cairo',
        clientId: 'c1',
        workflowType: 2,
        stageTemplateId: null,
        estimatedStartDate: '2026-11-01',
        estimatedEndDate: null,
      });
      expect(call.request.body).not.toHaveProperty('status');
      expect(call.request.body).not.toHaveProperty('estimatedBudget');
      call.flush({ projectId: 'p1' });

      expect(id).toBe('p1');
    });

    it('has EN and AR copy for the new projects.ClientNotFound code', () => {
      expect(ERROR_MESSAGES['projects.ClientNotFound']).toBeTruthy();
      expect(ERROR_MESSAGES_AR['projects.ClientNotFound']).toBeTruthy();
    });
  });

  describe('getByClient (008b #1) — GET /api/projects, filtered on clientId client-side', () => {
    it("lists the first 100 visible projects and keeps only the client's", () => {
      let ids: string[] = [];
      service.getByClient('c1').subscribe((r) => (ids = r.map((p) => p.id)));

      const call = http.expectOne(
        (r) =>
          r.method === 'GET' &&
          r.url === `${environment.apiUrl}/projects` &&
          r.params.get('pageNumber') === '1' &&
          r.params.get('pageSize') === '100',
      );
      expect(call.request.params.has('clientId')).toBe(false);
      call.flush({
        items: [
          { id: 'p1', clientId: 'c1' },
          { id: 'p2', clientId: 'c2' },
          { id: 'p3', clientId: 'c1' },
        ],
        pageNumber: 1,
        pageSize: 100,
        totalCount: 3,
        totalPages: 1,
      });

      expect(ids).toEqual(['p1', 'p3']);
    });
  });

  describe('getDetails (crm-prod B2-fe part 2) — GET /api/projects/{id}/details', () => {
    // Copied from the backend shape: ProjectDetailsResponse, ProjectDetailsProjectResponse,
    // ProjectStageDetailsResponse, TaskStatusCount, GateSummary
    // (dms src/Modules/Projects/Projects.Contracts/Projects/ProjectContracts.cs:57-85) and
    // ProjectTaskResponse (Projects.Contracts/Tasks/TaskContracts.cs:5-8). Enums are ints
    // (Projects.Contracts/Enums.cs). Route: Projects.Infrastructure/Endpoints/ProjectEndpoints.cs:43.
    const backendDetails = {
      project: {
        id: 'p1',
        code: 'MT-04',
        name: 'Marina Tower',
        description: null,
        status: 2,
        workflowType: 1,
        address: 'New Cairo',
        notes: 'n',
        progressPercentage: 42.5,
        estimatedStartDate: '2026-02-03T00:00:00',
        estimatedEndDate: '2026-11-22T00:00:00',
        actualStartDate: '2026-02-05T00:00:00',
        actualEndDate: null,
        clientId: 'c1',
        clientName: 'Hassan Allam Holding',
        ownerId: 'e-owner',
        isActive: true,
        stageCount: 2,
      },
      stages: [
        {
          id: 's2',
          projectId: 'p1',
          stageId: null,
          name: 'Execution',
          description: null,
          order: 20,
          status: 1,
          progressPercent: 0,
          completedTasks: 0,
          totalTasks: 0,
          cost: null,
          estimatedStartDate: null,
          estimatedEndDate: null,
          actualStartDate: null,
          actualEndDate: null,
          notes: null,
          tasks: [],
          taskCounts: [],
          gates: { total: 0, pending: 0, satisfied: 0, rejected: 0 },
        },
        {
          id: 's1',
          projectId: 'p1',
          stageId: 'tpl-1',
          name: 'Design',
          description: 'd',
          order: 10,
          status: 2,
          progressPercent: 50,
          completedTasks: 1,
          totalTasks: 2,
          cost: 1000,
          estimatedStartDate: '2026-03-01T00:00:00',
          estimatedEndDate: '2026-04-01T00:00:00',
          actualStartDate: '2026-03-02T00:00:00',
          actualEndDate: null,
          notes: 'sn',
          tasks: [
            {
              id: 't1',
              projectId: 'p1',
              projectStageId: 's1',
              name: 'Floor plan',
              description: null,
              order: 10,
              status: 4,
              priority: 3,
              weight: 2,
              assignedToId: 'e-1',
              departmentId: null,
              dueDate: '2026-03-20T00:00:00',
              cost: null,
            },
            {
              id: 't2',
              projectId: 'p1',
              projectStageId: 's1',
              name: 'Facade',
              description: null,
              order: 20,
              status: 7,
              priority: 4,
              weight: 1,
              assignedToId: null,
              departmentId: null,
              dueDate: null,
              cost: null,
            },
          ],
          taskCounts: [
            { status: 4, count: 1 },
            { status: 7, count: 1 },
          ],
          gates: { total: 3, pending: 1, satisfied: 1, rejected: 1 },
        },
      ],
      unstagedTasks: [
        {
          id: 't3',
          projectId: 'p1',
          projectStageId: null,
          name: 'Loose',
          description: null,
          order: 1,
          status: 2,
          priority: 1,
          weight: 1,
          assignedToId: null,
          departmentId: null,
          dueDate: null,
          cost: null,
        },
      ],
      taskCounts: [
        { status: 2, count: 1 },
        { status: 4, count: 1 },
        { status: 7, count: 1 },
      ],
      gates: { total: 4, pending: 2, satisfied: 1, rejected: 1 },
    };

    function load(): ProjectDetails {
      let out: ProjectDetails | undefined;
      service.getDetails('p1').subscribe((d) => (out = d));
      const call = http.expectOne(`${environment.apiUrl}/projects/p1/details`);
      expect(call.request.method).toBe('GET');
      call.flush(backendDetails);
      return out!;
    }

    it('calls /projects/{id}/details and marks 404 handled (the page owns the not-found state)', () => {
      service.getDetails('p1').subscribe();
      const call = http.expectOne(`${environment.apiUrl}/projects/p1/details`);
      expect(call.request.context.get(HANDLED_ERROR_STATUSES)).toEqual([404]);
      call.flush(backendDetails);
    });

    it('maps the project header: ownerId, estimated dates, int enums, clientName', () => {
      const { project } = load();
      expect(project).toMatchObject({
        id: 'p1',
        code: 'MT-04',
        name: 'Marina Tower',
        status: 'InProgress',
        workflowType: 'Stage',
        address: 'New Cairo',
        notes: 'n',
        progressPercentage: 42.5,
        startDate: '2026-02-03T00:00:00',
        endDate: '2026-11-22T00:00:00',
        actualStartDate: '2026-02-05T00:00:00',
        actualEndDate: null,
        clientId: 'c1',
        clientName: 'Hassan Allam Holding',
        productOwnerId: 'e-owner',
        isActive: true,
        stageCount: 2,
      });
      // No backend source: stay empty, never a fabricated value.
      expect(project.productOwnerName).toBe('');
      expect(project.estimatedBudget).toBe(0);
      expect(project.financial).toBeUndefined();
    });

    it('maps stages in order with their tasks, counts and gate summaries', () => {
      const d = load();
      expect(d.stages.map((s) => s.id)).toEqual(['s1', 's2']);
      const s1 = d.stages[0];
      expect(s1).toMatchObject({
        projectId: 'p1',
        stageId: 'tpl-1',
        name: 'Design',
        order: 10,
        status: 'Active',
        progressPercent: 50,
        completedTasks: 1,
        totalTasks: 2,
        estimatedStartDate: '2026-03-01T00:00:00',
        estimatedEndDate: '2026-04-01T00:00:00',
        startedOnUtc: '2026-03-02T00:00:00',
        completedOnUtc: null,
        notes: 'sn',
        taskCounts: [
          { status: 'Completed', count: 1 },
          { status: 'Cancelled', count: 1 },
        ],
        gates: { total: 3, pending: 1, satisfied: 1, rejected: 1 },
      });
      expect(d.stages[1].status).toBe('Locked');
      expect(s1.kind).toBeUndefined();
      expect(s1.crm).toBeNull();
      expect(s1.tasks.map((t) => [t.id, t.status, t.priority])).toEqual([
        ['t1', 'Completed', 'High'],
        ['t2', 'Cancelled', 'Urgent'],
      ]);
      expect(s1.tasks[0]).toMatchObject({
        projectStageId: 's1',
        assignedToId: 'e-1',
        weight: 2,
        dueDate: '2026-03-20T00:00:00',
      });
      // ProjectTaskResponse has no sub-task progress: null (the page shows a dash), not 0.
      expect(s1.tasks[0].progressPercent).toBeNull();
    });

    it('maps unstaged tasks and the project-wide counts and gates', () => {
      const d = load();
      expect(d.unstagedTasks.map((t) => [t.id, t.status, t.priority, t.projectStageId])).toEqual([
        ['t3', 'Open', 'Low', null],
      ]);
      expect(d.taskCounts).toEqual([
        { status: 'Open', count: 1 },
        { status: 'Completed', count: 1 },
        { status: 'Cancelled', count: 1 },
      ]);
      expect(d.gates).toEqual({ total: 4, pending: 2, satisfied: 1, rejected: 1 });
    });
  });

  describe('status and active (crm-prod H5) — query-bound, ProjectEndpoints.cs:59-73', () => {
    it.each([
      ['Draft', 1],
      ['InProgress', 2],
      ['OnHold', 3],
      ['Completed', 4],
      ['Cancelled', 5],
    ] as const)(
      'setStatus(%s) sends PUT /projects/{id}/status?status=%i with no body',
      (status, ordinal) => {
        service.setStatus('p1', status).subscribe();

        const call = http.expectOne(
          (r) => r.urlWithParams === `${environment.apiUrl}/projects/p1/status?status=${ordinal}`,
        );
        expect(call.request.method).toBe('PUT');
        expect(call.request.body).toBeNull();
        call.flush(null, { status: 204, statusText: 'No Content' });
      },
    );

    it('activate sends PUT /projects/{id}/active?isActive=true', () => {
      service.activate('p1').subscribe();

      const call = http.expectOne(`${environment.apiUrl}/projects/p1/active?isActive=true`);
      expect(call.request.method).toBe('PUT');
      expect(call.request.body).toBeNull();
      call.flush(null, { status: 204, statusText: 'No Content' });
    });

    it('deactivate sends PUT /projects/{id}/active?isActive=false', () => {
      service.deactivate('p1').subscribe();

      const call = http.expectOne(`${environment.apiUrl}/projects/p1/active?isActive=false`);
      expect(call.request.method).toBe('PUT');
      expect(call.request.body).toBeNull();
      call.flush(null, { status: 204, statusText: 'No Content' });
    });
  });
});

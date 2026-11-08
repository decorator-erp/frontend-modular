import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { environment } from '../../../../environments/environment';
import { ProjectTaskService } from './project-task.service';

/** crmp A-2: tasks moved under the project (dms `TaskEndpoints.cs:23-123`); transitions are POSTs. */
describe('ProjectTaskService (crmp A-2)', () => {
  let service: ProjectTaskService;
  let http: HttpTestingController;
  const api = environment.apiUrl;
  const base = `${api}/projects/P1/tasks`;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(ProjectTaskService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('lists GET /projects/{pid}/tasks with no params by default (TaskEndpoints.cs:23)', () => {
    service.getByProject('P1').subscribe();
    const r = http.expectOne(base);
    expect(r.request.params.keys()).toEqual([]);
    r.flush([]);
  });

  it('filters by stage, assignee and status (int) and pages on request', () => {
    service
      .getByProject('P1', {
        stageId: 'S1',
        assigneeId: 'E1',
        status: 'InProgress',
        pageNumber: 2,
        pageSize: 50,
      })
      .subscribe();
    const r = http.expectOne((x) => x.url === base);
    expect(r.request.params.get('stageId')).toBe('S1');
    expect(r.request.params.get('assigneeId')).toBe('E1');
    expect(r.request.params.get('status')).toBe('3');
    expect(r.request.params.get('pageNumber')).toBe('2');
    expect(r.request.params.get('pageSize')).toBe('50');
    r.flush([]);
  });

  it('getByStage is ?stageId= (gap table P-37)', () => {
    service.getByStage('P1', 'S1').subscribe();
    const r = http.expectOne((x) => x.url === base);
    expect(r.request.params.get('stageId')).toBe('S1');
    r.flush([]);
  });

  it('reads details {task, subTasks, counts, gates} (TaskEndpoints.cs:64)', () => {
    let gates = '';
    service
      .getDetails('P1', 'T1')
      .subscribe((d) => (gates = `${d.gates.satisfied}/${d.gates.total}:${d.commentsCount}`));
    http.expectOne(`${base}/T1/details`).flush({
      task: { id: 'T1', projectId: 'P1', name: 'x', status: 2 },
      subTasks: [],
      subTasksCount: 0,
      commentsCount: 3,
      gates: { total: 2, pending: 1, satisfied: 1, rejected: 0 },
    });
    expect(gates).toBe('1/2:3');
  });

  it('creates with the TaskRequest body, dueDate as UTC Z, reads taskId (TaskEndpoints.cs:35,228)', () => {
    let id = '';
    service
      .create('P1', {
        name: 'n',
        order: 10,
        weight: 1,
        priority: 'High',
        projectStageId: 'S1',
        assignedToId: null,
        dueDate: '2026-11-20',
      })
      .subscribe((v) => (id = v));
    const r = http.expectOne(base);
    expect(r.request.method).toBe('POST');
    expect(r.request.body).toEqual({
      projectStageId: 'S1',
      assignedToId: null,
      name: 'n',
      description: null,
      notes: null,
      priority: 3,
      weight: 1,
      order: 10,
      dueDate: '2026-11-20T00:00:00Z',
    });
    r.flush({ taskId: 'T9' });
    expect(id).toBe('T9');
  });

  it('updates with PUT and deletes with DELETE on …/tasks/{id} (TaskEndpoints.cs:46,56)', () => {
    service.update('P1', 'T1', { name: 'n', order: 1, weight: 1, priority: 'Low' }).subscribe();
    const u = http.expectOne(`${base}/T1`);
    expect(u.request.method).toBe('PUT');
    expect(u.request.body).not.toHaveProperty('projectStageId');
    service.remove('P1', 'T1').subscribe();
    expect(http.expectOne(`${base}/T1`).request.method).toBe('DELETE');
  });

  it.each([
    ['start', '/start'],
    ['complete', '/complete'],
    ['cancel', '/cancel'],
    ['reopen', '/reopen'],
  ] as const)('%s is a POST to …/tasks/{id}%s', (op, path) => {
    service[op]('P1', 'T1').subscribe();
    expect(http.expectOne(`${base}/T1${path}`).request.method).toBe('POST');
  });

  it('assigns with POST { employeeId } and rejects with POST { reason } (TaskEndpoints.cs:81,106)', () => {
    service.assign('P1', 'T1', 'E1').subscribe();
    const a = http.expectOne(`${base}/T1/assign`);
    expect(a.request.method).toBe('POST');
    expect(a.request.body).toEqual({ employeeId: 'E1' });
    service.reject('P1', 'T1', 'redo').subscribe();
    const r = http.expectOne(`${base}/T1/reject`);
    expect(r.request.body).toEqual({ reason: 'redo' });
  });
});

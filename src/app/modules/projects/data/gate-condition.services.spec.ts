import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { environment } from '../../../../environments/environment';
import { StageGateConditionService } from './stage-gate-condition.service';
import { TaskGateConditionService } from './task-gate-condition.service';
import { GateNotRecreatableError, GateRemovedError } from './project.service';
import type { CreateGateConditionRequest } from '../model/project.model';

/** crmp A-2: gates moved under the project (dms `GateEndpoints.cs:24-74`); PUT update removed. */
describe('Stage/Task gate condition services (crmp A-2)', () => {
  let stage: StageGateConditionService;
  let task: TaskGateConditionService;
  let http: HttpTestingController;
  const api = environment.apiUrl;
  const req: CreateGateConditionRequest = {
    conditionType: 'Approval',
    trigger: 'Complete',
    label: 'Sign-off',
    referencedTaskId: null,
    referencedStageId: null,
    approvalType: 'ClientReview',
    referencedDocumentId: null,
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    stage = TestBed.inject(StageGateConditionService);
    task = TestBed.inject(TaskGateConditionService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('lists stage gates on GET /projects/{pid}/stages/{sid}/gates and maps status 2 to satisfied (GateEndpoints.cs:24)', () => {
    let sat: boolean[] = [];
    stage.getByStage('P1', 'S1').subscribe((g) => (sat = g.map((x) => x.isSatisfied)));
    const r = http.expectOne(`${api}/projects/P1/stages/S1/gates`);
    expect(r.request.method).toBe('GET');
    r.flush([
      { id: 'G1', projectStageId: 'S1', conditionType: 4, trigger: 2, label: 'a', status: 2 },
      { id: 'G2', projectStageId: 'S1', conditionType: 4, trigger: 2, label: 'b', status: 1 },
    ]);
    expect(sat).toEqual([true, false]);
  });

  it('lists task gates on GET /projects/{pid}/tasks/{tid}/gates (GateEndpoints.cs:42)', () => {
    let owner = '';
    task.getByTask('P1', 'T1').subscribe((g) => (owner = g[0]?.ownerId ?? ''));
    http
      .expectOne(`${api}/projects/P1/tasks/T1/gates`)
      .flush([{ id: 'G1', projectTaskId: 'T1', status: 1 }]);
    expect(owner).toBe('T1');
  });

  it('creates a stage gate with int enums and reads gateConditionId (GateEndpoints.cs:32)', () => {
    let id = '';
    stage.create('P1', 'S1', req).subscribe((v) => (id = v));
    const r = http.expectOne(`${api}/projects/P1/stages/S1/gates`);
    expect(r.request.method).toBe('POST');
    expect(r.request.body).toEqual({
      conditionType: 3,
      trigger: 2,
      label: 'Sign-off',
      referencedTaskId: null,
      referencedStageId: null,
      referencedDocumentId: null,
      approvalType: 2,
    });
    r.flush({ gateConditionId: 'G9' });
    expect(id).toBe('G9');
  });

  it('creates a task gate on POST /projects/{pid}/tasks/{tid}/gates (GateEndpoints.cs:50)', () => {
    task.create('P1', 'T1', req).subscribe();
    expect(http.expectOne(`${api}/projects/P1/tasks/T1/gates`).request.method).toBe('POST');
  });

  it('deletes on DELETE /projects/{pid}/gates/{id} and satisfies on POST …/satisfy (GateEndpoints.cs:60,68)', () => {
    task.remove('P1', 'G1').subscribe();
    expect(http.expectOne(`${api}/projects/P1/gates/G1`).request.method).toBe('DELETE');
    stage.satisfy('P1', 'G1', { note: 'ok' }).subscribe();
    const s = http.expectOne(`${api}/projects/P1/gates/G1/satisfy`);
    expect(s.request.method).toBe('POST');
    expect(s.request.body).toEqual({ note: 'ok' });
  });

  it('re-creates as DELETE then POST, never a PUT', () => {
    let id = '';
    stage.recreate('P1', 'S1', 'G1', req).subscribe((v) => (id = v));
    http.expectOne(`${api}/projects/P1/gates/G1`).flush(null);
    http.expectOne(`${api}/projects/P1/stages/S1/gates`).flush({ gateConditionId: 'G2' });
    expect(id).toBe('G2');
  });

  it('R1-F4: reads and sends DocumentApproved (10) with its document', () => {
    let types: string[] = [];
    stage
      .getByStage('P1', 'S1')
      .subscribe((g) => (types = g.map((x) => `${x.conditionType}:${x.referencedDocumentId}`)));
    http
      .expectOne(`${api}/projects/P1/stages/S1/gates`)
      .flush([{ id: 'G1', conditionType: 10, referencedDocumentId: 'D1', status: 1 }]);
    expect(types).toEqual(['DocumentApproved:D1']);
    stage
      .create('P1', 'S1', {
        ...req,
        conditionType: 'DocumentApproved',
        approvalType: null,
        referencedDocumentId: 'D1',
      })
      .subscribe();
    const r = http.expectOne(`${api}/projects/P1/stages/S1/gates`);
    expect(r.request.body).toMatchObject({ conditionType: 10, referencedDocumentId: 'D1' });
  });

  it('R1-F4: a failed create after the delete surfaces as GateRemovedError', () => {
    let err: unknown;
    stage.recreate('P1', 'S1', 'G1', req).subscribe({ error: (e) => (err = e) });
    http.expectOne(`${api}/projects/P1/gates/G1`).flush(null);
    http
      .expectOne(`${api}/projects/P1/stages/S1/gates`)
      .flush(null, { status: 409, statusText: 'Conflict' });
    expect(err).toBeInstanceOf(GateRemovedError);
  });

  it('R2-1: a DocumentApproved gate without its document is refused before anything is deleted', () => {
    let err: unknown;
    stage
      .recreate('P1', 'S1', 'G1', {
        ...req,
        conditionType: 'DocumentApproved',
        approvalType: null,
        referencedDocumentId: null,
      })
      .subscribe({ error: (e) => (err = e) });
    http.expectNone(`${api}/projects/P1/gates/G1`);
    expect(err).toBeInstanceOf(GateNotRecreatableError);
  });
});

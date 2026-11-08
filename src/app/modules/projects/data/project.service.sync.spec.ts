import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { environment } from '../../../../environments/environment';
import { ProjectService } from './project.service';
import { ProjectTaskService } from './project-task.service';
import type { ProjectTask } from '../model/project.model';

/** Sync run (backend contract S1, S2): fields the projects normalizers must read. */
describe('projects normalizers — sync contract', () => {
  let projects: ProjectService;
  let tasks: ProjectTaskService;
  let http: HttpTestingController;
  const base = `${environment.apiUrl}/projects/P1/tasks`;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    projects = TestBed.inject(ProjectService);
    tasks = TestBed.inject(ProjectTaskService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('W1-2 (S1): a task PUT re-sends the notes read from the server', () => {
    let task: ProjectTask | undefined;
    tasks.getDetails('P1', 'T1').subscribe((d) => (task = d.task));
    http.expectOne(`${base}/T1/details`).flush({
      task: { id: 'T1', projectId: 'P1', name: 'Paint', status: 2, priority: 2, notes: 'keep me' },
      subTasks: [],
      gates: { total: 0, pending: 0, satisfied: 0, rejected: 0 },
    });
    const t = task!;
    tasks
      .update('P1', t.id, {
        name: t.name,
        order: t.order,
        weight: t.weight,
        priority: t.priority,
        description: t.description,
        notes: t.notes,
      })
      .subscribe();
    const put = http.expectOne(`${base}/T1`);
    expect(put.request.method).toBe('PUT');
    expect(put.request.body.notes).toBe('keep me');
    put.flush(null);
  });

  it('W1-3 (S2): a gate reads referencedDocumentId and the resolved* fields as satisfied*', () => {
    const g = projects.normalizeGate({
      id: 'G1',
      projectStageId: 'S1',
      conditionType: 10,
      trigger: 1,
      label: 'Drawings approved',
      status: 2,
      referencedDocumentId: 'D1',
      resolvedById: 'U7',
      resolvedAt: '2026-11-01T10:00:00Z',
      resolutionNote: 'Checked on site',
    });
    expect(g.referencedDocumentId).toBe('D1');
    expect(g.satisfiedById).toBe('U7');
    expect(g.satisfiedAt).toBe('2026-11-01T10:00:00Z');
    expect(g.satisfiedNote).toBe('Checked on site');
  });

  it('W1-3 (S2): an older response without the new fields still reads (nulls, old names)', () => {
    const g = projects.normalizeGate({
      id: 'G1',
      conditionType: 4,
      status: 1,
      satisfiedNote: 'old',
    });
    expect(g.referencedDocumentId).toBeNull();
    expect(g.satisfiedById).toBeNull();
    expect(g.satisfiedNote).toBe('old');
  });

  it('W2-10: a task reads departmentId and a stage reads cost (null when absent)', () => {
    expect(projects.normalizeTask({ id: 'T1', departmentId: 'D4' }, 'P1').departmentId).toBe('D4');
    expect(projects.normalizeTask({ id: 'T1' }, 'P1').departmentId).toBeNull();
    expect(projects.normalizeStage({ id: 'S1', cost: 1250.5 }, 'P1').cost).toBe(1250.5);
    expect(projects.normalizeStage({ id: 'S1' }, 'P1').cost).toBeNull();
  });
});

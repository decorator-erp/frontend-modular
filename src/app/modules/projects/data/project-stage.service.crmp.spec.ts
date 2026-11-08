import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { environment } from '../../../../environments/environment';
import { ProjectStageService } from './project-stage.service';

/** crmp A-2: stage reads and writes moved under the project (dms `StageEndpoints.cs:24-93`). */
describe('ProjectStageService (crmp A-2)', () => {
  let service: ProjectStageService;
  let http: HttpTestingController;
  const base = `${environment.apiUrl}/projects/P1/stages`;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(ProjectStageService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('reads one stage on GET /projects/{pid}/stages/{sid} (StageEndpoints.cs:32)', () => {
    let pid = '';
    service.getDetails('P1', 'S1').subscribe((s) => (pid = s.projectId));
    http
      .expectOne(`${base}/S1`)
      .flush({ id: 'S1', projectId: 'P1', name: 'x', order: 1, status: 2 });
    expect(pid).toBe('P1');
  });

  it('creates with StageRequest (dates as UTC Z, templateStageId) and reads stageId (StageEndpoints.cs:41,93)', () => {
    let id = '';
    service
      .create('P1', {
        name: 'Design',
        order: 2,
        templateStageId: 'TS1',
        estimatedStartDate: '2026-12-01',
      })
      .subscribe((v) => (id = v));
    const r = http.expectOne(base);
    expect(r.request.method).toBe('POST');
    expect(r.request.body).toEqual({
      name: 'Design',
      order: 2,
      description: null,
      notes: null,
      estimatedStartDate: '2026-12-01T00:00:00Z',
      estimatedEndDate: null,
      templateStageId: 'TS1',
    });
    r.flush({ stageId: 'S9' });
    expect(id).toBe('S9');
  });

  it('updates with PUT and deletes with DELETE on …/stages/{sid} (StageEndpoints.cs:52,62)', () => {
    service.update('P1', 'S1', { name: 'x', order: 1 }).subscribe();
    const u = http.expectOne(`${base}/S1`);
    expect(u.request.method).toBe('PUT');
    expect(u.request.body).not.toHaveProperty('templateStageId');
    service.remove('P1', 'S1').subscribe();
    expect(http.expectOne(`${base}/S1`).request.method).toBe('DELETE');
  });

  it('completes with POST and no fields; rejects with POST { reason } (StageEndpoints.cs:70,78)', () => {
    service.complete('P1', 'S1').subscribe();
    const c = http.expectOne(`${base}/S1/complete`);
    expect(c.request.method).toBe('POST');
    expect(c.request.body).toEqual({});
    service.reject('P1', 'S1', 'redo').subscribe();
    const r = http.expectOne(`${base}/S1/reject`);
    expect(r.request.method).toBe('POST');
    expect(r.request.body).toEqual({ reason: 'redo' });
  });
});

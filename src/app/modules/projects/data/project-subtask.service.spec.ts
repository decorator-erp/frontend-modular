import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { environment } from '../../../../environments/environment';
import { ProjectSubTaskService } from './project-subtask.service';

/** crmp A-2: sub-tasks moved under the project (dms `TaskEndpoints.cs:131-177`). */
describe('ProjectSubTaskService (crmp A-2)', () => {
  let service: ProjectSubTaskService;
  let http: HttpTestingController;
  const base = `${environment.apiUrl}/projects/P1/tasks/T1/sub-tasks`;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(ProjectSubTaskService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('lists GET …/tasks/{taskId}/sub-tasks sorted by order (TaskEndpoints.cs:131)', () => {
    let titles: string[] = [];
    service.getByTask('P1', 'T1').subscribe((l) => (titles = l.map((s) => s.title)));
    const req = http.expectOne(base);
    expect(req.request.method).toBe('GET');
    req.flush([
      { id: 'S2', projectTaskId: 'T1', title: 'b', order: 20, isRequired: true, isDone: false },
      { id: 'S1', projectTaskId: 'T1', title: 'a', order: 10, isRequired: false, isDone: true },
    ]);
    expect(titles).toEqual(['a', 'b']);
  });

  it('creates with POST and reads subTaskId (TaskEndpoints.cs:141)', () => {
    let id = '';
    service
      .create('P1', 'T1', { title: 'x', order: 10, isRequired: true })
      .subscribe((v) => (id = v));
    const req = http.expectOne(base);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ title: 'x', order: 10, isRequired: true });
    req.flush({ subTaskId: 'S9' });
    expect(id).toBe('S9');
  });

  it('updates with PUT …/sub-tasks/{id} (TaskEndpoints.cs:151)', () => {
    service.update('P1', 'T1', 'S1', { title: 'y', order: 10, isRequired: false }).subscribe();
    const req = http.expectOne(`${base}/S1`);
    expect(req.request.method).toBe('PUT');
    req.flush(null);
  });

  it('deletes with DELETE …/sub-tasks/{id} (TaskEndpoints.cs:161)', () => {
    service.remove('P1', 'T1', 'S1').subscribe();
    expect(http.expectOne(`${base}/S1`).request.method).toBe('DELETE');
  });

  it('reopens with POST …/sub-tasks/{id}/reopen (TaskEndpoints.cs:169)', () => {
    service.reopen('P1', 'T1', 'S1').subscribe();
    expect(http.expectOne(`${base}/S1/reopen`).request.method).toBe('POST');
  });

  it('completes with POST /projects/{pid}/tasks/sub-tasks/{id}/complete (TaskEndpoints.cs:177)', () => {
    service.markDone('P1', 'S1').subscribe();
    const req = http.expectOne(`${environment.apiUrl}/projects/P1/tasks/sub-tasks/S1/complete`);
    expect(req.request.method).toBe('POST');
  });
});

import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { environment } from '../../../../environments/environment';
import { TaskCommentService } from './task-comment.service';

/** crmp A-2: comments moved under the project (dms `TaskEndpoints.cs:185-215`). */
describe('TaskCommentService (crmp A-2)', () => {
  let service: TaskCommentService;
  let http: HttpTestingController;
  const base = `${environment.apiUrl}/projects/P1/tasks/T1/comments`;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(TaskCommentService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('lists without paging params by default (TaskEndpoints.cs:185)', () => {
    let ids: string[] = [];
    service.getByTask('P1', 'T1').subscribe((c) => (ids = c.map((x) => x.id)));
    const req = http.expectOne(base);
    expect(req.request.method).toBe('GET');
    expect(req.request.params.keys()).toEqual([]);
    req.flush([
      {
        id: 'C1',
        taskId: 'T1',
        employeeId: 'E1',
        content: 'x',
        createdAtUtc: '2026-11-07T10:00:00Z',
      },
    ]);
    expect(ids).toEqual(['C1']);
  });

  it('sends pageNumber/pageSize when a page is asked for (opt-in, §1.6)', () => {
    service.getByTask('P1', 'T1', { pageNumber: 2, pageSize: 20 }).subscribe();
    const req = http.expectOne((r) => r.url === base);
    expect(req.request.params.get('pageNumber')).toBe('2');
    expect(req.request.params.get('pageSize')).toBe('20');
    req.flush([]);
  });

  it('adds with { content } and reads commentId (TaskEndpoints.cs:195)', () => {
    let id = '';
    service.create('P1', 'T1', 'hello').subscribe((v) => (id = v));
    const req = http.expectOne(base);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ content: 'hello' });
    req.flush({ commentId: 'C9' });
    expect(id).toBe('C9');
  });

  it('edits with PUT …/comments/{id} (TaskEndpoints.cs:206)', () => {
    service.update('P1', 'T1', 'C1', 'edited').subscribe();
    const req = http.expectOne(`${base}/C1`);
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({ content: 'edited' });
    req.flush(null);
  });

  it('deletes with DELETE …/comments/{id} (TaskEndpoints.cs:215)', () => {
    service.remove('P1', 'T1', 'C1').subscribe();
    const req = http.expectOne(`${base}/C1`);
    expect(req.request.method).toBe('DELETE');
    req.flush(null);
  });
});

import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { HANDLED_ERROR_STATUSES } from '@platform/http/handled-errors';
import { ProjectMemberService } from './project-member.service';
import { ProjectSubTaskService } from './project-subtask.service';
import { StageTeamsService } from './stage-teams.service';
import { TaskCommentService } from './task-comment.service';

/**
 * Review CP-9: every screen shows these writes' refusals itself (inline or as a catalog toast), so
 * each carries handled(403, 409) and the interceptor's generic English 403 toast does not repeat it.
 */
describe('projects writes are handled(403, 409) (review CP-9)', () => {
  let http: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  function expectHandled(call: () => Observable<unknown>): void {
    call().subscribe({ error: () => undefined });
    const req = http.match(() => true);
    expect(req.length).toBe(1);
    expect(req[0].request.context.get(HANDLED_ERROR_STATUSES)).toEqual(
      expect.arrayContaining([403, 409]),
    );
    req[0].flush(null);
  }

  it('members: add, change access, remove', () => {
    const s = TestBed.inject(ProjectMemberService);
    expectHandled(() => s.add({ projectId: 'P1', employeeId: 'E1', access: 'Viewer' }));
    expectHandled(() => s.changeAccess('P1', 'M1', { access: 'Manager' }));
    expectHandled(() => s.remove('P1', 'M1'));
  });

  it('sub-tasks: create, update, remove, complete, reopen', () => {
    const s = TestBed.inject(ProjectSubTaskService);
    const req = { title: 'x', order: 10, isRequired: false };
    expectHandled(() => s.create('P1', 'T1', req));
    expectHandled(() => s.update('P1', 'T1', 'S1', req));
    expectHandled(() => s.remove('P1', 'T1', 'S1'));
    expectHandled(() => s.markDone('P1', 'S1'));
    expectHandled(() => s.reopen('P1', 'T1', 'S1'));
  });

  it('teams: create, create standalone, add member, change role, remove member, change head', () => {
    const s = TestBed.inject(StageTeamsService);
    expectHandled(() => s.create('P1', 'S1', 'D1'));
    expectHandled(() => s.createStandalone('P1', 'S1', 'E1'));
    expectHandled(() => s.addMember('P1', 'TM1', 'E1'));
    expectHandled(() => s.changeMemberRole('P1', 'M1', 'Reviewer'));
    expectHandled(() => s.removeMember('P1', 'M1'));
    expectHandled(() => s.changeHead('P1', 'TM1', 'E1'));
  });

  it('comments: create, update, remove', () => {
    const s = TestBed.inject(TaskCommentService);
    expectHandled(() => s.create('P1', 'T1', 'hi'));
    expectHandled(() => s.update('P1', 'T1', 'C1', 'hi'));
    expectHandled(() => s.remove('P1', 'T1', 'C1'));
  });
});

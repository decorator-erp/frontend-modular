import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { describe, expect, it } from 'vitest';
import { PERM, PermissionsService } from '@platform/permissions';
import { TaskCommentService } from '../../data/task-comment.service';
import {
  ProjectAction,
  ProjectLevel,
  canChangeComment,
  canProjectAction,
} from '../../model/project-actions';
import { ProjectAccessStore } from '../../stores/project-access.store';
import { CommentsThreadComponent } from './comments-thread.component';

const comments = [
  {
    id: 'C1',
    taskId: 'T1',
    employeeId: 'ME',
    content: 'mine',
    createdAtUtc: '2026-11-07T10:00:00Z',
    updatedAtUtc: null,
  },
  {
    id: 'C2',
    taskId: 'T1',
    employeeId: 'OTHER',
    content: 'theirs',
    createdAtUtc: '2026-11-07T11:00:00Z',
    updatedAtUtc: null,
  },
];

/** crmp P-6: add needs Editor; edit/delete need the author or the stage_tasks.manage claim. */
describe('CommentsThreadComponent — levels (crmp P-6)', () => {
  function render(level: ProjectLevel, grants: string[]) {
    const g = new Set(grants);
    const gate = { myLevel: level, status: 'InProgress' as const, isActive: true };
    TestBed.configureTestingModule({
      imports: [CommentsThreadComponent],
      providers: [
        { provide: TaskCommentService, useValue: { getByTask: () => of(comments) } },
        {
          provide: PermissionsService,
          useValue: {
            can: (p: string | string[]) => (Array.isArray(p) ? p : [p]).some((x) => g.has(x)),
          },
        },
        {
          provide: ProjectAccessStore,
          useValue: {
            can: (_id: string, a: ProjectAction) => canProjectAction(gate, a, (p) => g.has(p)),
            canComment: (
              _id: string,
              c: { employeeId: string },
              a: 'comment.edit' | 'comment.delete',
            ) => canChangeComment(gate, c, 'ME', (p) => g.has(p), a),
          },
        },
      ],
    });
    const f = TestBed.createComponent(CommentsThreadComponent);
    f.componentRef.setInput('projectId', 'P1');
    f.componentRef.setInput('taskId', 'T1');
    f.detectChanges();
    return { c: f.componentInstance, el: f.nativeElement as HTMLElement };
  }

  it('Viewer: cannot add, edit or delete', () => {
    const { c, el } = render('Viewer', [PERM.stageTasks.read, PERM.stageTasks.complete]);
    expect(c.canAdd()).toBe(false);
    expect(el.querySelectorAll('[data-edit], [data-delete]').length).toBe(0);
  });

  it('Editor without stage_tasks.manage: adds, and changes only their own comment', () => {
    const { c, el } = render('Editor', [PERM.stageTasks.read, PERM.stageTasks.complete]);
    expect(c.canAdd()).toBe(true);
    expect(el.querySelectorAll('[data-delete]').length).toBe(1);
  });

  it('Manager without the claim is still limited to their own comment; the claim opens all', () => {
    expect(
      render('Manager', [PERM.stageTasks.read, PERM.stageTasks.complete]).el.querySelectorAll(
        '[data-delete]',
      ).length,
    ).toBe(1);
    TestBed.resetTestingModule();
    expect(
      render('Editor', [PERM.stageTasks.read, PERM.stageTasks.manage]).el.querySelectorAll(
        '[data-delete]',
      ).length,
    ).toBe(2);
  });
});

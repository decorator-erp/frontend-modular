import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { describe, expect, it } from 'vitest';
import { CommentsThreadComponent } from './comments-thread.component';
import { TaskCommentService } from '../../data/task-comment.service';
import { ProjectAccessStore } from '../../stores/project-access.store';
import type { TaskComment } from '../../model/project.model';

const comment = (id: string, employeeId: string): TaskComment => ({
  id,
  taskId: 'T1',
  employeeId,
  content: 'x',
  createdAtUtc: '2026-11-07T10:00:00Z',
  updatedAtUtc: null,
});

/** Sync W2-4: TaskCommentResponse carries only EmployeeId; the author resolves from the directory. */
describe('CommentsThreadComponent — comment authors (sync W2-4)', () => {
  it("names each author from the host's employee map, 'Member' only when unknown", () => {
    TestBed.configureTestingModule({
      imports: [CommentsThreadComponent],
      providers: [
        {
          provide: TaskCommentService,
          useValue: { getByTask: () => of([comment('C1', 'E1'), comment('C2', 'E9')]) },
        },
        { provide: ProjectAccessStore, useValue: { can: () => true, canComment: () => true } },
      ],
    });
    const fixture = TestBed.createComponent(CommentsThreadComponent);
    fixture.componentRef.setInput('projectId', 'P1');
    fixture.componentRef.setInput('taskId', 'T1');
    fixture.componentRef.setInput('authorNames', new Map([['E1', 'Mona Adel']]));
    fixture.detectChanges();
    const names = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll('[data-author]'),
    ).map((n) => n.textContent?.trim());
    expect(names).toEqual(['Mona Adel', 'Member']);
  });
});

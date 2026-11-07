import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { COMMENT_PAGE_SIZE, CommentsThreadComponent } from './comments-thread.component';
import { TaskCommentService } from '../../data/task-comment.service';
import type { TaskComment } from '../../model/project.model';

const page = (from: number, n: number): TaskComment[] =>
  Array.from({ length: n }, (_, i) => ({
    id: `C${from + i}`,
    taskId: 'T1',
    employeeId: 'E1',
    content: 'x',
    createdAtUtc: '2026-11-07T10:00:00Z',
    updatedAtUtc: null,
  }));

/** crmp A-4: comments load a page at a time (opt-in paging, contract §1.6). */
describe('CommentsThreadComponent — paged loading (crmp A-4)', () => {
  function make(pages: TaskComment[][]) {
    const getByTask = vi.fn((_p: string, _t: string, req?: { pageNumber: number }) =>
      of(pages[(req?.pageNumber ?? 1) - 1] ?? []),
    );
    TestBed.configureTestingModule({
      imports: [CommentsThreadComponent],
      providers: [{ provide: TaskCommentService, useValue: { getByTask } }],
    });
    const fixture = TestBed.createComponent(CommentsThreadComponent);
    fixture.componentRef.setInput('projectId', 'P1');
    fixture.componentRef.setInput('taskId', 'T1');
    fixture.detectChanges();
    return { c: fixture.componentInstance, getByTask, fixture };
  }

  it('asks for page 1 of COMMENT_PAGE_SIZE and offers more when the page is full', () => {
    const { c, getByTask } = make([page(0, COMMENT_PAGE_SIZE), page(COMMENT_PAGE_SIZE, 3)]);
    expect(getByTask).toHaveBeenCalledWith('P1', 'T1', {
      pageNumber: 1,
      pageSize: COMMENT_PAGE_SIZE,
    });
    expect(c.hasMore()).toBe(true);
    c.loadMore();
    expect(getByTask).toHaveBeenLastCalledWith('P1', 'T1', {
      pageNumber: 2,
      pageSize: COMMENT_PAGE_SIZE,
    });
    expect(c.comments().length).toBe(COMMENT_PAGE_SIZE + 3);
    expect(c.hasMore()).toBe(false);
  });

  it('a short first page is the last one: no "Load more"', () => {
    const { c, fixture } = make([page(0, 2)]);
    expect(c.hasMore()).toBe(false);
    expect((fixture.nativeElement as HTMLElement).textContent).not.toContain('Load more');
  });
});

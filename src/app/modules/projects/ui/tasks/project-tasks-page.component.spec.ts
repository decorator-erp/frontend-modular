import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { of, throwError } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { EmployeeService } from '@modules/people';
import { ToastService } from '@platform/feedback/toast.service';
import { ProjectStageService } from '../../data/project-stage.service';
import { ProjectTaskService } from '../../data/project-task.service';
import { ProjectAccessStore } from '../../stores/project-access.store';
import { TASK_PAGE_SIZE, ProjectTasksPageComponent } from './project-tasks-page.component';

const task = (i: number) => ({
  id: `T${i}`,
  projectId: 'P1',
  name: `Task ${i}`,
  status: 'Open',
  projectStageId: null,
  assignedToId: null,
  dueDate: null,
});

/** crmp P-3: the task list filters by stage, assignee and status, a page at a time. */
describe('ProjectTasksPageComponent (crmp P-3)', () => {
  function make(pages: unknown[][]) {
    const getByProject = vi.fn((_p: string, q: { pageNumber: number }) =>
      of(pages[q.pageNumber - 1] ?? []),
    );
    TestBed.configureTestingModule({
      imports: [ProjectTasksPageComponent],
      providers: [
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: convertToParamMap({ id: 'P1' }) } },
        },
        { provide: ProjectTaskService, useValue: { getByProject } },
        {
          provide: ProjectStageService,
          useValue: { getByProject: () => of([{ id: 'S1', name: 'Design' }]) },
        },
        {
          provide: EmployeeService,
          useValue: { listPaged: () => of({ items: [{ id: 'E1', fullName: 'Sara' }] }) },
        },
        {
          provide: ProjectAccessStore,
          useValue: { ensure: () => undefined, project: () => () => null },
        },
      ],
    });
    const f = TestBed.createComponent(ProjectTasksPageComponent);
    f.detectChanges();
    return { c: f.componentInstance, getByProject, el: f.nativeElement as HTMLElement, f };
  }

  it('reads page 1 with no filters, then sends each filter as the query', () => {
    const { c, getByProject } = make([[task(1)]]);
    expect(getByProject).toHaveBeenCalledWith('P1', {
      stageId: null,
      assigneeId: null,
      status: null,
      pageNumber: 1,
      pageSize: TASK_PAGE_SIZE,
    });
    c.setFilter('stage', 'S1');
    c.setFilter('assignee', 'E1');
    c.setFilter('status', 'InProgress');
    expect(getByProject).toHaveBeenLastCalledWith('P1', {
      stageId: 'S1',
      assigneeId: 'E1',
      status: 'InProgress',
      pageNumber: 1,
      pageSize: TASK_PAGE_SIZE,
    });
  });

  it('a full page offers Load more, which appends the next page', () => {
    const full = Array.from({ length: TASK_PAGE_SIZE }, (_, i) => task(i));
    const { c, f, el } = make([full, [task(999)]]);
    f.detectChanges();
    expect(el.querySelector('[data-load-more]')).toBeTruthy();
    c.loadMore();
    expect(c.tasks().length).toBe(TASK_PAGE_SIZE + 1);
    expect(c.hasMore()).toBe(false);
  });

  it('an empty result shows the empty state', () => {
    const { el, f } = make([[]]);
    f.detectChanges();
    expect(el.textContent).toContain('No tasks match');
  });

  it.each([
    [403, 0],
    [500, 0],
    [0, 0],
    [404, 1],
  ])(
    'blind-all E1: a failed Load more with %s toasts %s time(s) here (the interceptor owns 0/403/5xx)',
    (status, n) => {
      const full = Array.from({ length: TASK_PAGE_SIZE }, (_, i) => task(i));
      const { c } = make([full]);
      const svc = TestBed.inject(ProjectTaskService) as unknown as {
        getByProject: ReturnType<typeof vi.fn>;
      };
      svc.getByProject.mockReturnValueOnce(throwError(() => new HttpErrorResponse({ status })));
      const toast = TestBed.inject(ToastService);
      const show = vi.spyOn(toast, 'show');
      c.loadMore();
      expect(show).toHaveBeenCalledTimes(n);
    },
  );
});

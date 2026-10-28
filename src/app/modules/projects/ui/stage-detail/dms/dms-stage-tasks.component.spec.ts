import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { DmsStageTasksComponent } from './dms-stage-tasks.component';
import type { ProjectTask } from '../../../model/project.model';

function task(o: Partial<ProjectTask> = {}): ProjectTask {
  return {
    id: 't1',
    projectId: 'p1',
    projectStageId: 's1',
    assignedToId: null,
    name: 'Task',
    order: 1,
    status: 'InProgress',
    priority: 'Medium',
    weight: 3,
    estimatedStartDate: '2026-06-06',
    dueDate: '2026-06-20',
    description: null,
    notes: null,
    ...o,
  } as unknown as ProjectTask;
}

describe('DmsStageTasksComponent', () => {
  function make(tasks: ProjectTask[], filter: 'all' | ProjectTask['status'] = 'all') {
    TestBed.configureTestingModule({
      imports: [DmsStageTasksComponent],
      providers: [provideRouter([])],
    });
    const fixture = TestBed.createComponent(DmsStageTasksComponent);
    fixture.componentRef.setInput('tasks', tasks);
    fixture.componentRef.setInput('filter', filter);
    fixture.detectChanges();
    return fixture;
  }

  it('defaults to the list view and toggles to gantt', () => {
    const fixture = make([task()]);
    expect(fixture.componentInstance.view()).toBe('list');
    expect(fixture.nativeElement.querySelector('.thd')).toBeTruthy(); // list header
    expect(fixture.nativeElement.querySelector('.gt-body')).toBeNull();

    fixture.componentInstance.view.set('gantt');
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.gt-body')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('.thd')).toBeNull();
  });

  it('renders one gantt row per filtered task', () => {
    const fixture = make([
      task({ id: 'a', order: 1 }),
      task({ id: 'b', order: 2 }),
      task({ id: 'c', order: 3, status: 'Completed' }),
    ]);
    fixture.componentInstance.view.set('gantt');
    fixture.detectChanges();
    expect(fixture.componentInstance['gantt']().rows.length).toBe(3);
    expect(fixture.nativeElement.querySelectorAll('.gt-row').length).toBe(3);
  });

  it('applies the status filter in both views', () => {
    const tasks = [
      task({ id: 'a', status: 'InProgress' }),
      task({ id: 'b', status: 'Completed' }),
      task({ id: 'c', status: 'Completed' }),
    ];
    const fixture = make(tasks, 'Completed');
    // list
    expect(fixture.componentInstance['visible']().length).toBe(2);
    // gantt
    fixture.componentInstance.view.set('gantt');
    fixture.detectChanges();
    expect(fixture.componentInstance['gantt']().rows.length).toBe(2);
  });

  it('flags missing planned dates instead of fabricating a range', () => {
    const fixture = make([task({ id: 'a', estimatedStartDate: null, dueDate: null })]);
    fixture.componentInstance.view.set('gantt');
    fixture.detectChanges();
    // no dates at all → empty-state caption, not a chart
    expect(fixture.componentInstance['gantt']().hasDates).toBe(false);
    expect(fixture.nativeElement.textContent).toContain('No planned dates');
  });
});

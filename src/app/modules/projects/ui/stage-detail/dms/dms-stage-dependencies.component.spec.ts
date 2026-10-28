import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { DmsStageDependenciesComponent } from './dms-stage-dependencies.component';
import type { ProjectStage } from '../../../model/project.model';

function stage(id: string, order: number, status: ProjectStage['status'] = 'Locked'): ProjectStage {
  return {
    id,
    projectId: 'p1',
    name: `Stage ${order}`,
    order,
    status,
    tasks: [],
    totalTasks: 0,
    completedTasks: 0,
  } as unknown as ProjectStage;
}

describe('DmsStageDependenciesComponent', () => {
  function make(currentId: string) {
    const stages = [
      stage('s1', 1, 'Completed'),
      stage('s2', 2, 'Completed'),
      stage('s3', 3, 'Active'),
      stage('s4', 4),
      stage('s5', 5),
    ];
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [DmsStageDependenciesComponent],
      providers: [provideRouter([])],
    });
    const fixture = TestBed.createComponent(DmsStageDependenciesComponent);
    fixture.componentRef.setInput('stages', stages);
    fixture.componentRef.setInput('currentStageId', currentId);
    fixture.componentRef.setInput('projectId', 'p1');
    fixture.detectChanges();
    return fixture;
  }

  it('derives upstream from lower-order stages and downstream from higher-order', () => {
    const fixture = make('s3');
    const up = fixture.componentInstance.upstream();
    const down = fixture.componentInstance.downstream();
    expect(up.map((d) => d.id)).toEqual(['s1', 's2']);
    expect(down.map((d) => d.id)).toEqual(['s4', 's5']);
    expect(up[0].code).toBe('Stage 01');
    expect(up[0].label).toBe('Completed');
  });

  it('links each dependency row to its DMS stage route', () => {
    const fixture = make('s3');
    const links = Array.from(
      fixture.nativeElement.querySelectorAll('a[data-dep-row]'),
    ) as HTMLAnchorElement[];
    expect(links.length).toBe(4); // 2 up + 2 down
    expect(links[0].getAttribute('href')).toContain('/projects/p1/stages/s1');
  });

  it('shows empty-group captions at the ends of the chain', () => {
    const first = make('s1');
    expect(first.componentInstance.upstream().length).toBe(0);
    expect(first.nativeElement.textContent).toContain('nothing upstream');

    const last = make('s5');
    expect(last.componentInstance.downstream().length).toBe(0);
    expect(last.nativeElement.textContent).toContain('nothing downstream');
  });
});

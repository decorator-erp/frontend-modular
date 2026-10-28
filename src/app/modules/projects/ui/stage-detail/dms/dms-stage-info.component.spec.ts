import { NO_ERRORS_SCHEMA } from '@angular/core';
import { TestBed, ComponentFixture } from '@angular/core/testing';
import { LocaleService } from '@platform/i18n';
import type { ProjectStage } from '../../../model/project.model';
import { DmsStageInfoComponent } from './dms-stage-info.component';

function stage(over: Partial<ProjectStage> = {}): ProjectStage {
  return {
    id: 's1',
    projectId: 'p1',
    stageId: null,
    name: 'Design',
    description: null,
    order: 1,
    status: 'Active',
    progressPercent: 0,
    completedTasks: 0,
    totalTasks: 0,
    notes: null,
    tasks: [],
    estimatedStartDate: null,
    estimatedEndDate: null,
    startedOnUtc: null,
    completedOnUtc: null,
    ...over,
  } as ProjectStage;
}

describe('DmsStageInfoComponent (inline edit)', () => {
  function render(
    canManage: boolean,
    s: ProjectStage = stage(),
  ): ComponentFixture<DmsStageInfoComponent> {
    TestBed.configureTestingModule({
      imports: [DmsStageInfoComponent],
      providers: [{ provide: LocaleService, useValue: { locale: () => 'en' } }],
    });
    TestBed.overrideComponent(DmsStageInfoComponent, {
      set: { imports: [], schemas: [NO_ERRORS_SCHEMA] },
    });
    const fixture = TestBed.createComponent(DmsStageInfoComponent);
    fixture.componentRef.setInput('stage', s);
    fixture.componentRef.setInput('canManage', canManage);
    fixture.componentRef.setInput('ownerId', null);
    fixture.componentRef.setInput('employeeOptions', [{ value: 'e1', label: 'Alice' }]);
    fixture.detectChanges();
    return fixture;
  }

  function editStartInput(fixture: ComponentFixture<DmsStageInfoComponent>): HTMLInputElement {
    fixture.componentInstance.startEdit('start');
    fixture.detectChanges();
    return (fixture.nativeElement as HTMLElement).querySelector('input.ie') as HTMLInputElement;
  }

  it('emits the new start date on the input "change" event', () => {
    const fixture = render(true);
    let emitted: string | undefined;
    fixture.componentInstance.saveStartDate.subscribe((v) => (emitted = v));

    const input = editStartInput(fixture);
    input.value = '2026-07-01';
    input.dispatchEvent(new Event('change'));

    expect(emitted).toBe('2026-07-01');
  });

  // Regression: tearing the input down on blur used to drop the edit before it
  // persisted — blur must also commit so the request still goes out.
  it('emits the new start date on "blur" too', () => {
    const fixture = render(true);
    let emitted: string | undefined;
    fixture.componentInstance.saveStartDate.subscribe((v) => (emitted = v));

    const input = editStartInput(fixture);
    input.value = '2026-08-15';
    input.dispatchEvent(new Event('blur'));

    expect(emitted).toBe('2026-08-15');
  });

  it('commits once when change and blur both fire', () => {
    const fixture = render(true);
    const seen: string[] = [];
    fixture.componentInstance.saveStartDate.subscribe((v) => seen.push(v));

    const input = editStartInput(fixture);
    input.value = '2026-09-01';
    input.dispatchEvent(new Event('change'));
    input.dispatchEvent(new Event('blur'));

    expect(seen).toEqual(['2026-09-01']);
  });

  it('does not emit when Escape cancels the edit', () => {
    const fixture = render(true);
    let emitted: string | undefined;
    fixture.componentInstance.saveStartDate.subscribe((v) => (emitted = v));

    const input = editStartInput(fixture);
    input.value = '2026-07-01';
    fixture.componentInstance.cancelEdit();
    input.dispatchEvent(new Event('blur')); // trailing blur must be ignored after cancel

    expect(emitted).toBeUndefined();
  });

  it('does not emit when the value is unchanged', () => {
    const fixture = render(true, stage({ estimatedStartDate: '2026-07-01T00:00:00' }));
    let emitted: string | undefined;
    fixture.componentInstance.saveStartDate.subscribe((v) => (emitted = v));

    const input = editStartInput(fixture);
    input.value = '2026-07-01';
    input.dispatchEvent(new Event('change'));

    expect(emitted).toBeUndefined();
  });

  it('keeps the editable rows read-only when canManage is false', () => {
    const fixture = render(false);
    expect((fixture.nativeElement as HTMLElement).querySelector('.ie-trigger')).toBeNull();
  });

  // Duration is the planned span (start → target), not "elapsed since actual start".
  it('reports the planned span as the duration', () => {
    const fixture = render(
      false,
      stage({ estimatedStartDate: '2026-06-20T00:00:00', estimatedEndDate: '2026-07-30T00:00:00' }),
    );
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('40 days planned');
  });

  it('uses the planned span even when the stage has actually started (no actual-date masking)', () => {
    const fixture = render(
      false,
      stage({
        estimatedStartDate: '2026-06-20T00:00:00',
        estimatedEndDate: '2026-07-30T00:00:00',
        startedOnUtc: '2026-06-25T00:00:00',
      }),
    );
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('40 days planned');
  });
});

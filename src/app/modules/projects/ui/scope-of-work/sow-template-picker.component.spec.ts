import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, expect, it, beforeEach } from 'vitest';
import type { TemplateStage } from '@modules/library';
import { EN } from '@platform/i18n/catalog/en';
import { SowTemplatePickerComponent } from './sow-template-picker.component';

function stage(over: Partial<TemplateStage> = {}): TemplateStage {
  return {
    id: 'r1',
    stageTemplateId: 't1',
    name: 'Concept design',
    description: null,
    order: 1,
    weightPercent: 20,
    defaultFee: 25000,
    taskCount: 6,
    ...over,
  };
}

const TEMPLATES = [
  { id: 't1', name: 'Residential — full design' },
  { id: 't2', name: 'Medical fit-out' },
];
const STAGES = [
  stage(),
  stage({ id: 'r2', name: 'Execution drawings', order: 2, defaultFee: null, taskCount: 9 }),
];

/** sow #4: the template picker (B6). */
describe('SowTemplatePickerComponent (sow #4)', () => {
  let fixture: ComponentFixture<SowTemplatePickerComponent>;
  let el: HTMLElement;
  const emitted: Record<string, string[]> = {};

  function render(picked: string[] = []) {
    fixture.componentRef.setInput('templates', TEMPLATES);
    fixture.componentRef.setInput('selectedTemplateId', 't1');
    fixture.componentRef.setInput('stages', STAGES);
    fixture.componentRef.setInput('pickedStageIds', picked);
    fixture.detectChanges();
  }

  const stageRows = () => Array.from(el.querySelectorAll<HTMLElement>('[data-stage-row]'));

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [SowTemplatePickerComponent] });
    fixture = TestBed.createComponent(SowTemplatePickerComponent);
    el = fixture.nativeElement;
    for (const key of ['selectTemplate', 'addStage', 'removeStage', 'addTemplate']) {
      emitted[key] = [];
    }
    const c = fixture.componentInstance;
    c.selectTemplate.subscribe((id) => emitted['selectTemplate'].push(id));
    c.addStage.subscribe((id) => emitted['addStage'].push(id));
    c.removeStage.subscribe((id) => emitted['removeStage'].push(id));
    c.addTemplate.subscribe((id) => emitted['addTemplate'].push(id));
  });

  it('renders one pill per template, the selected one pressed', () => {
    render();
    const pills = Array.from(el.querySelectorAll<HTMLButtonElement>('[role="group"] button'));
    expect(pills.map((p) => p.textContent?.trim())).toEqual([
      'Residential — full design',
      'Medical fit-out',
    ]);
    expect(pills[0].getAttribute('aria-pressed')).toBe('true');
    expect(pills[1].getAttribute('aria-pressed')).toBe('false');
    expect(el.querySelector('[role="group"]')?.getAttribute('aria-label')).toBe(
      EN['sow.templates'],
    );
  });

  it('clicking a pill selects that template', () => {
    render();
    el.querySelectorAll<HTMLButtonElement>('[role="group"] button')[1].click();
    expect(emitted['selectTemplate']).toEqual(['t2']);
  });

  it('stage rows show the task count and the default fee; no fee when it is null', () => {
    render();
    const [first, second] = stageRows();
    expect(first.textContent).toContain('Concept design');
    // FINDING-7-10: plural-safe ("Tasks: 1", not "1 tasks").
    expect(first.textContent).toContain('Tasks: 6');
    expect(first.textContent).toContain(EN['sow.defaultFee']);
    expect(first.querySelector('pera-currency')?.textContent).toContain('25,000');
    expect(first.querySelector('pera-currency')?.textContent).toContain('EGP');
    expect(second.textContent).toContain('Tasks: 9');
    expect(second.textContent).not.toContain(EN['sow.defaultFee']);
    expect(second.querySelector('pera-currency')).toBeNull();
  });

  it('"Add" emits the stage id; an added stage reads "Added · remove" and emits removeStage', () => {
    render(['r2']);
    const [first, second] = stageRows();
    const add = first.querySelector<HTMLButtonElement>('button')!;
    const added = second.querySelector<HTMLButtonElement>('button')!;
    expect(add.textContent?.trim()).toBe(EN['sow.add']);
    expect(add.getAttribute('aria-label')).toBe('Add Concept design');
    expect(added.textContent?.trim()).toBe(EN['sow.addedRemove']);
    expect(added.getAttribute('aria-label')).toBe('Added · remove Execution drawings');
    add.click();
    added.click();
    expect(emitted['addStage']).toEqual(['r1']);
    expect(emitted['removeStage']).toEqual(['r2']);
  });

  it('"Add whole template" emits the selected template id', () => {
    render();
    const whole = Array.from(el.querySelectorAll<HTMLButtonElement>('button')).find(
      (b) => b.textContent?.trim() === EN['sow.addWholeTemplate'],
    )!;
    whole.click();
    expect(emitted['addTemplate']).toEqual(['t1']);
  });

  it('shows the empty copy when there are no templates', () => {
    fixture.componentRef.setInput('templates', []);
    fixture.componentRef.setInput('selectedTemplateId', null);
    fixture.componentRef.setInput('stages', []);
    fixture.componentRef.setInput('pickedStageIds', []);
    fixture.detectChanges();
    expect(el.textContent).toContain(EN['sow.noTemplates']);
  });
});

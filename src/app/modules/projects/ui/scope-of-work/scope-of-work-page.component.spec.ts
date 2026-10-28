import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { of } from 'rxjs';
import { PermissionsService, PERM } from '@platform/permissions';
import { ProjectService } from '../../data/project.service';
import { ScopeOfWorkService } from '../../data/scope-of-work.service';
import { ScopeOfWork, ScopeOfWorkItem, ScopeOfWorkStatus } from '../../model/scope-of-work.model';
import { ScopeOfWorkPageComponent } from './scope-of-work-page.component';
import { StageTemplatesService } from '@modules/library';
import { EN } from '@platform/i18n/catalog/en';

function item(over: Partial<ScopeOfWorkItem> = {}): ScopeOfWorkItem {
  return {
    id: 'i1',
    sourceStageId: 's1',
    sourceTemplateName: 'Residential',
    name: 'Concept design',
    description: 'Mood boards',
    order: 1,
    fee: 25000,
    createdStageId: null,
    sourceMissing: false,
    ...over,
  };
}

function scope(over: Partial<ScopeOfWork> = {}): ScopeOfWork {
  return {
    id: 'sow1',
    projectId: 'p1',
    status: ScopeOfWorkStatus.Draft,
    durationDays: null,
    plannedStartDate: null,
    estimatedEndDate: null,
    subtotal: 0,
    adjustmentAmount: 0,
    adjustmentNote: null,
    total: 0,
    notes: null,
    confirmedAtUtc: null,
    confirmedById: null,
    items: [item(), item({ id: 'i2', sourceStageId: 's2', order: 2, name: 'Drawings' })],
    canConfirm: false,
    blockingReason: null,
    ...over,
  };
}

/** sow #3: the page wires the items table to the store. */
describe('ScopeOfWorkPageComponent — items (sow #3)', () => {
  let fixture: ComponentFixture<ScopeOfWorkPageComponent>;
  let el: HTMLElement;
  let api: Record<string, ReturnType<typeof vi.fn>>;
  let granted: Set<string>;
  let templates: { list: ReturnType<typeof vi.fn>; stages: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    granted = new Set([PERM.scope.read, PERM.scope.manage]);
    api = {
      getScope: vi.fn().mockReturnValue(of(scope())),
      updateItem: vi.fn().mockReturnValue(of(undefined)),
      reorder: vi.fn().mockReturnValue(of(undefined)),
      removeItem: vi.fn().mockReturnValue(of(undefined)),
      addItems: vi.fn().mockReturnValue(of([])),
      addFromTemplate: vi.fn().mockReturnValue(of([])),
    };
    const templateStage = (id: string, name: string, order: number, defaultFee: number | null) => ({
      id,
      stageTemplateId: 't1',
      name,
      description: null,
      order,
      weightPercent: 0,
      defaultFee,
      taskCount: 2,
    });
    templates = {
      list: vi.fn().mockReturnValue(of([{ id: 't1', name: 'Residential', isActive: true }])),
      stages: vi
        .fn()
        .mockReturnValue(
          of([
            templateStage('s1', 'Concept design', 1, 25000),
            templateStage('s9', 'Supervision', 2, null),
          ]),
        ),
    };
    TestBed.configureTestingModule({
      imports: [ScopeOfWorkPageComponent],
      providers: [
        provideRouter([]),
        { provide: ScopeOfWorkService, useValue: api },
        {
          provide: ProjectService,
          useValue: {
            getById: vi
              .fn()
              .mockReturnValue(of({ id: 'p1', name: 'Villa', workflowType: 'Stage' })),
          },
        },
        { provide: PermissionsService, useValue: { can: (p: string) => granted.has(p) } },
        { provide: StageTemplatesService, useValue: templates },
      ],
    });
  });

  function render() {
    fixture = TestBed.createComponent(ScopeOfWorkPageComponent);
    fixture.componentRef.setInput('id', 'p1');
    fixture.detectChanges();
    el = fixture.nativeElement;
  }

  const rows = () => Array.from(el.querySelectorAll<HTMLTableRowElement>('tbody tr'));

  it('loads the project scope from the route id and renders its items (B1, B2)', () => {
    render();
    expect(api['getScope']).toHaveBeenCalledWith('p1');
    expect(rows()).toHaveLength(2);
  });

  it('a name change calls updateItem with the stored description (B3)', () => {
    render();
    const input = rows()[0].querySelector<HTMLInputElement>('pera-input input')!;
    input.value = 'Concept';
    input.dispatchEvent(new Event('change', { bubbles: true }));
    expect(api['updateItem']).toHaveBeenCalledWith('p1', 'i1', {
      name: 'Concept',
      description: 'Mood boards',
      fee: 25000,
    });
  });

  it('move down sends the full order; remove deletes (B4, B5)', () => {
    render();
    rows()[0].querySelector<HTMLButtonElement>('button[aria-label^="Move item 1 down"]')!.click();
    expect(api['reorder']).toHaveBeenCalledWith('p1', ['i2', 'i1']);
    rows()[1].querySelector<HTMLButtonElement>('button[aria-label^="Remove item 2"]')!.click();
    expect(api['removeItem']).toHaveBeenCalledWith('p1', 'i2');
  });

  it('without scope.manage the table is read-only (B15)', () => {
    granted.delete(PERM.scope.manage);
    render();
    expect(el.querySelectorAll('tbody button')).toHaveLength(0);
  });

  const toggle = () =>
    Array.from(el.querySelectorAll<HTMLButtonElement>('pera-button button')).find((b) =>
      ([EN['sow.addFromTemplates'], EN['sow.closeTemplates']] as string[]).includes(
        b.textContent!.trim(),
      ),
    );

  it('sow #4: the picker toggle opens the templates once and closes again (B6)', () => {
    render();
    expect(el.querySelector('app-sow-template-picker')).toBeNull();
    expect(toggle()!.textContent!.trim()).toBe(EN['sow.addFromTemplates']);
    expect(el.querySelector('pera-button')!.getAttribute('aria-expanded')).toBe('false');

    toggle()!.click();
    fixture.detectChanges();
    expect(el.querySelector('app-sow-template-picker')).not.toBeNull();
    expect(toggle()!.textContent!.trim()).toBe(EN['sow.closeTemplates']);
    expect(el.querySelector('pera-button')!.getAttribute('aria-expanded')).toBe('true');
    expect(templates.list).toHaveBeenCalledTimes(1);
    expect(templates.stages).toHaveBeenCalledWith('t1');

    toggle()!.click();
    fixture.detectChanges();
    expect(el.querySelector('app-sow-template-picker')).toBeNull();
    toggle()!.click();
    fixture.detectChanges();
    expect(templates.list).toHaveBeenCalledTimes(1);
  });

  it('sow #4: Add, Added · remove and Add whole template reach the API (B6)', () => {
    render();
    toggle()!.click();
    fixture.detectChanges();
    const picker = el.querySelector('app-sow-template-picker')!;
    const buttons = Array.from(
      picker.querySelectorAll<HTMLButtonElement>('[data-stage-row] button'),
    );
    // s1 is already in the scope (item i1), s9 is not.
    expect(buttons[0].textContent!.trim()).toBe(EN['sow.addedRemove']);
    buttons[0].click();
    expect(api['removeItem']).toHaveBeenCalledWith('p1', 'i1');
    buttons[1].click();
    expect(api['addItems']).toHaveBeenCalledWith('p1', ['s9']);
    Array.from(picker.querySelectorAll<HTMLButtonElement>('pera-button button'))
      .find((b) => b.textContent!.trim() === EN['sow.addWholeTemplate'])!
      .click();
    expect(api['addFromTemplate']).toHaveBeenCalledWith('p1', 't1');
  });

  it('sow #4: no picker toggle without scope.manage (B15)', () => {
    granted.delete(PERM.scope.manage);
    render();
    expect(toggle()).toBeUndefined();
  });
});

import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { of, throwError } from 'rxjs';
import { PermissionsService, PERM } from '@platform/permissions';
import { ProjectService } from '../../data/project.service';
import { ScopeOfWorkService } from '../../data/scope-of-work.service';
import { ScopeOfWork, ScopeOfWorkItem, ScopeOfWorkStatus } from '../../model/scope-of-work.model';
import { ScopeOfWorkPageComponent } from './scope-of-work-page.component';
import { StageTemplatesService } from '@modules/library';
import { EmployeeService } from '@modules/people';
import { ConfirmService } from '@ds';
import { EN } from '@platform/i18n/catalog/en';
import { formatCairoDate } from '@platform/i18n/intl-locale';

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
  let employees: { getById: ReturnType<typeof vi.fn> };
  let dialog: { open: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    granted = new Set([PERM.scope.read, PERM.scope.manage, PERM.scope.confirm]);
    employees = { getById: vi.fn().mockReturnValue(of({ id: 'e1', fullName: 'Mona Adel' })) };
    dialog = { open: vi.fn().mockResolvedValue(true) };
    api = {
      getScope: vi.fn().mockReturnValue(of(scope())),
      updateItem: vi.fn().mockReturnValue(of(undefined)),
      reorder: vi.fn().mockReturnValue(of(undefined)),
      removeItem: vi.fn().mockReturnValue(of(undefined)),
      addItems: vi.fn().mockReturnValue(of([])),
      addFromTemplate: vi.fn().mockReturnValue(of([])),
      updateHeader: vi.fn().mockReturnValue(of(undefined)),
      confirm: vi.fn().mockReturnValue(of({ createdStageIds: ['st1', 'st2'] })),
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
        { provide: EmployeeService, useValue: employees },
        { provide: ConfirmService, useValue: dialog },
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

  it('sow #5: a duration change sends one full header PUT, then reloads (B7, B9)', () => {
    render();
    const input = el.querySelector<HTMLInputElement>('app-sow-summary pera-input input')!;
    input.value = '45';
    input.dispatchEvent(new Event('change', { bubbles: true }));
    expect(api['updateHeader']).toHaveBeenCalledTimes(1);
    expect(api['updateHeader']).toHaveBeenCalledWith('p1', {
      durationDays: 45,
      plannedStartDate: null,
      adjustmentAmount: 0,
      adjustmentNote: null,
      notes: null,
    });
    expect(api['getScope']).toHaveBeenCalledTimes(2);
  });

  const confirmButton = () =>
    Array.from(el.querySelectorAll<HTMLButtonElement>('app-sow-summary pera-button button')).find(
      (b) => b.textContent!.trim() === EN['sow.confirmScope'],
    );

  const confirmedScope = () =>
    scope({
      status: ScopeOfWorkStatus.Confirmed,
      durationDays: 120,
      plannedStartDate: '2026-11-01',
      estimatedEndDate: '2027-03-01',
      total: 50000,
      confirmedAtUtc: '2026-10-27T09:30:00Z',
      confirmedById: 'e1',
      items: [
        item({ createdStageId: 'st1' }),
        item({ id: 'i2', sourceStageId: 's2', order: 2, name: 'Drawings', createdStageId: 'st2' }),
      ],
      canConfirm: false,
      blockingReason: 'projects.scope.Confirmed',
    });

  it('sow #7: Confirm asks through ConfirmService, then posts and reloads (B10)', async () => {
    api['getScope'].mockReturnValue(of(scope({ canConfirm: true })));
    render();
    confirmButton()!.click();
    await fixture.whenStable();
    expect(dialog.open).toHaveBeenCalledWith(
      expect.objectContaining({
        body: "Confirming creates 2 stages with their tasks, teams and cost, in this order. It can't be undone.",
        confirmLabel: EN['sow.confirmScope'],
      }),
    );
    expect(api['confirm']).toHaveBeenCalledWith('p1');
    expect(api['getScope']).toHaveBeenCalledTimes(2);
  });

  it('sow #7: a declined dialog posts nothing', async () => {
    api['getScope'].mockReturnValue(of(scope({ canConfirm: true })));
    dialog.open.mockResolvedValue(false);
    render();
    confirmButton()!.click();
    await fixture.whenStable();
    expect(api['confirm']).not.toHaveBeenCalled();
  });

  it('sow #7: confirm is disabled with the reason when canConfirm is false (B10)', () => {
    api['getScope'].mockReturnValue(
      of(scope({ canConfirm: false, blockingReason: 'projects.scope.DurationRequired' })),
    );
    render();
    expect(confirmButton()!.disabled).toBe(true);
    expect(el.querySelector('[data-blocking-reason]')!.textContent!.trim()).toBe(
      'Set the duration before confirming the scope of work.',
    );
  });

  it('sow #7: confirm is disabled without scope.confirm (B10, B15)', () => {
    granted.delete(PERM.scope.confirm);
    api['getScope'].mockReturnValue(of(scope({ canConfirm: true })));
    render();
    expect(confirmButton()!.disabled).toBe(true);
    expect(el.querySelector('[data-blocking-reason]')!.textContent!.trim()).toBe(
      EN['sow.confirmNoPermission'],
    );
  });

  it('sow #7: Draft chip; no banner on a Draft', () => {
    render();
    expect(el.querySelector('[data-status]')!.textContent).toContain(EN['sow.statusDraft']);
    expect(el.querySelector('[data-confirmed-banner]')).toBeNull();
  });

  it('sow #7: confirmed: chip, banner with date and HR name, read-only, stage links (B11)', async () => {
    api['getScope'].mockReturnValue(of(confirmedScope()));
    render();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(el.querySelector('[data-status]')!.textContent).toContain(EN['sow.statusConfirmed']);
    const banner = el.querySelector('[data-confirmed-banner]')!.textContent!.replace(/\s+/g, ' ');
    expect(employees.getById).toHaveBeenCalledWith('e1');
    expect(banner).toContain(
      `Confirmed on ${formatCairoDate('2026-10-27T09:30:00Z', 'en')} by Mona Adel.`,
    );
    expect(banner).toContain(
      `2 stages created · total 50,000.00 EGP · ends ${formatCairoDate('2027-03-01T00:00:00Z', 'en')}.`,
    );
    // Every input disabled; no picker toggle, no row actions, no confirm button.
    const inputs = Array.from(el.querySelectorAll<HTMLInputElement>('input, textarea'));
    expect(inputs.length).toBeGreaterThan(0);
    expect(inputs.every((i) => i.disabled)).toBe(true);
    expect(toggle()).toBeUndefined();
    expect(el.querySelectorAll('tbody button')).toHaveLength(0);
    expect(confirmButton()).toBeUndefined();
    expect(el.textContent).toContain(EN['sow.readOnlyFooter']);
    const links = Array.from(el.querySelectorAll<HTMLAnchorElement>('tbody a'));
    expect(links.map((a) => a.getAttribute('href'))).toEqual([
      '/projects/p1/stages/st1',
      '/projects/p1/stages/st2',
    ]);
    expect(links[0].textContent!.trim()).toBe('Stage 1 created · open');
  });

  it('sow #7: the confirmer name is "—" when HR fails (B11)', async () => {
    api['getScope'].mockReturnValue(of(confirmedScope()));
    employees.getById.mockReturnValue(throwError(() => new Error('hr down')));
    render();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(el.querySelector('[data-confirmed-banner]')!.textContent).toContain('by —.');
  });

  it('sow #7: without scope.manage a Draft is read-only, with no banner (B15)', async () => {
    granted.delete(PERM.scope.manage);
    render();
    await fixture.whenStable();
    fixture.detectChanges();
    const inputs = Array.from(el.querySelectorAll<HTMLInputElement>('input, textarea'));
    expect(inputs.every((i) => i.disabled)).toBe(true);
    expect(el.querySelector('[data-confirmed-banner]')).toBeNull();
  });
});

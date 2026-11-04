import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { environment } from '../../../../../environments/environment';
import { provideRouter } from '@angular/router';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { of, Subject, throwError } from 'rxjs';
import { PermissionsService, PERM } from '@platform/permissions';
import { ToastService } from '@platform/feedback/toast.service';
import { ProjectService } from '../../data/project.service';
import { ScopeOfWorkService } from '../../data/scope-of-work.service';
import type { Project, ProjectDetails } from '../../model/project.model';
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

/** `ProjectService.getDetails()` result around a (partial) project — the header reads `.project`. */
function details(project: Partial<Project>): Partial<ProjectDetails> {
  return { project: project as Project, stages: [], unstagedTasks: [], taskCounts: [] };
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
    // crm-prod L-fe-5: the template picker also needs stages.read.
    granted = new Set([PERM.scope.read, PERM.scope.manage, PERM.scope.confirm, PERM.stages.read]);
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
            getDetails: vi
              .fn()
              .mockReturnValue(of(details({ id: 'p1', name: 'Villa', workflowType: 'Stage' }))),
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

  it('FINDING-7-2: a fee edit made while the name save is in flight keeps the new name', () => {
    const first = new Subject<void>();
    api['updateItem'].mockReturnValueOnce(first);
    render();
    const name = rows()[0].querySelector<HTMLInputElement>('pera-input input')!;
    name.value = 'Concept';
    name.dispatchEvent(new Event('change', { bubbles: true }));
    fixture.detectChanges();
    const fee = rows()[0].querySelector<HTMLInputElement>('pera-money-input input')!;
    fee.value = '30000';
    fee.dispatchEvent(new Event('change', { bubbles: true }));
    fixture.detectChanges();
    expect(api['updateItem']).toHaveBeenCalledTimes(1);
    first.next();
    first.complete();
    fixture.detectChanges();
    expect(api['updateItem']).toHaveBeenCalledTimes(2);
    expect(api['updateItem']).toHaveBeenLastCalledWith('p1', 'i1', {
      name: 'Concept',
      description: 'Mood boards',
      fee: 30000,
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
    Array.from(el.querySelectorAll<HTMLButtonElement>('button')).find((b) =>
      ([EN['sow.addFromTemplates'], EN['sow.closeTemplates']] as string[]).includes(
        b.textContent!.trim(),
      ),
    );

  it('sow #4: the picker toggle opens the templates once and closes again (B6)', () => {
    render();
    expect(el.querySelector('app-sow-template-picker')).toBeNull();
    expect(toggle()!.textContent!.trim()).toBe(EN['sow.addFromTemplates']);
    // FINDING-7-5: on the focusable <button> itself, not a wrapper host.
    expect(toggle()!.getAttribute('aria-expanded')).toBe('false');

    toggle()!.click();
    fixture.detectChanges();
    expect(el.querySelector('app-sow-template-picker')).not.toBeNull();
    expect(toggle()!.textContent!.trim()).toBe(EN['sow.closeTemplates']);
    expect(toggle()!.getAttribute('aria-expanded')).toBe('true');
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

  it('crm-prod L-fe-5: without stages.read the picker toggle is hidden and the page says why', () => {
    granted.delete(PERM.stages.read);
    render();
    expect(toggle()).toBeUndefined();
    expect(el.querySelector('app-sow-template-picker')).toBeNull();
    expect(el.querySelector('[data-picker-no-permission]')?.textContent?.trim()).toBe(
      EN['sow.pickerNoPermission'],
    );
    expect(templates.list).not.toHaveBeenCalled();
  });

  it('crm-prod L-fe-5: with stages.read there is no missing-permission message', () => {
    render();
    expect(toggle()).toBeDefined();
    expect(el.querySelector('[data-picker-no-permission]')).toBeNull();
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

  it('FINDING-7-1: a header edit made while the last save is in flight keeps that edit', () => {
    const first = new Subject<void>();
    api['updateHeader'].mockReturnValueOnce(first);
    render();
    const duration = el.querySelector<HTMLInputElement>('app-sow-summary pera-input input')!;
    duration.value = '45';
    duration.dispatchEvent(new Event('change', { bubbles: true }));
    fixture.detectChanges();
    const start = el.querySelector<HTMLInputElement>('app-sow-summary pera-date-input input')!;
    start.value = '2026-12-15';
    start.dispatchEvent(new Event('change', { bubbles: true }));
    fixture.detectChanges();
    // The second save waits for the first, so the server sees them in order.
    expect(api['updateHeader']).toHaveBeenCalledTimes(1);
    first.next();
    first.complete();
    fixture.detectChanges();
    expect(api['updateHeader']).toHaveBeenCalledTimes(2);
    expect(api['updateHeader']).toHaveBeenLastCalledWith('p1', {
      durationDays: 45,
      plannedStartDate: '2026-12-15',
      adjustmentAmount: 0,
      adjustmentNote: null,
      notes: null,
    });
    // One reload, once both saves are done.
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

  it('crm-prod L-fe-8: the confirm question names the stage count, the total and the estimated end', async () => {
    api['getScope'].mockReturnValue(
      of(scope({ canConfirm: true, total: 50000, estimatedEndDate: '2027-03-01' })),
    );
    render();
    confirmButton()!.click();
    await fixture.whenStable();
    const body = (dialog.open.mock.calls[0][0] as { body: string }).body;
    expect(body).toContain('Confirming creates 2 stages');
    expect(body).toContain('Total 50,000.00 EGP');
    expect(body).toContain(`estimated end ${formatCairoDate('2027-03-01T00:00:00Z', 'en')}.`);
  });

  it('sow #7: Confirm asks through ConfirmService, then posts and reloads (B10)', async () => {
    api['getScope'].mockReturnValue(of(scope({ canConfirm: true })));
    render();
    confirmButton()!.click();
    await fixture.whenStable();
    expect(dialog.open).toHaveBeenCalledWith(
      expect.objectContaining({
        body: "Confirming creates 2 stages with their tasks, teams and cost, in this order. It can't be undone. Total 0.00 EGP · estimated end —.",
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
  describe('crm-prod M6: one structural write at a time', () => {
    const removeButton = (n: number) =>
      rows()[n - 1].querySelector<HTMLButtonElement>(`button[aria-label^="Remove item ${n}"]`)!;
    const moveDown = (n: number) =>
      rows()[n - 1].querySelector<HTMLButtonElement>(`button[aria-label^="Move item ${n} down"]`)!;
    const pickerButton = (label: string) =>
      Array.from(el.querySelectorAll<HTMLButtonElement>('app-sow-template-picker button')).find(
        (b) => b.textContent!.trim() === label,
      )!;
    const openPicker = () => {
      toggle()!.click();
      fixture.detectChanges();
    };

    it('a double click on Remove sends one request', () => {
      api['removeItem'].mockReturnValue(new Subject<void>());
      render();
      const remove = removeButton(2);
      remove.click();
      remove.click();
      expect(api['removeItem']).toHaveBeenCalledTimes(1);
      fixture.detectChanges();
      expect(removeButton(1).disabled).toBe(true);
      expect(moveDown(1).disabled).toBe(true);
    });

    it('a double click on Move down sends one request', () => {
      api['reorder'].mockReturnValue(new Subject<void>());
      render();
      const down = moveDown(1);
      down.click();
      down.click();
      expect(api['reorder']).toHaveBeenCalledTimes(1);
    });

    it('move and remove stay disabled while the reload after a write is in flight', () => {
      render();
      const reload = new Subject<ScopeOfWork>();
      api['getScope'].mockReturnValue(reload);
      removeButton(2).click();
      fixture.detectChanges();
      expect(api['removeItem']).toHaveBeenCalledTimes(1);
      expect(removeButton(1).disabled).toBe(true);
      removeButton(1).click();
      expect(api['removeItem']).toHaveBeenCalledTimes(1);

      reload.next(scope({ items: [item()] }));
      fixture.detectChanges();
      expect(removeButton(1).disabled).toBe(false);
    });

    it('a double click on Add or Add whole template sends one request, and both wait for the reload', () => {
      render();
      openPicker();
      const reload = new Subject<ScopeOfWork>();
      api['getScope'].mockReturnValue(reload);
      api['addItems'].mockReturnValue(new Subject<void>());
      const add = pickerButton(EN['sow.add']);
      add.click();
      add.click();
      expect(api['addItems']).toHaveBeenCalledTimes(1);
      fixture.detectChanges();
      expect(pickerButton(EN['sow.add']).disabled).toBe(true);
      expect(pickerButton(EN['sow.addWholeTemplate']).disabled).toBe(true);
      pickerButton(EN['sow.addWholeTemplate']).click();
      expect(api['addFromTemplate']).not.toHaveBeenCalled();
    });

    it('a reorder pressed during an item save waits for it, then goes out once', () => {
      const save = new Subject<void>();
      api['updateItem'].mockReturnValueOnce(save);
      render();
      const name = rows()[0].querySelector<HTMLInputElement>('pera-input input')!;
      name.value = 'Concept';
      name.dispatchEvent(new Event('change', { bubbles: true }));
      // The press lands before the table re-renders disabled.
      moveDown(1).click();
      expect(api['reorder']).not.toHaveBeenCalled();

      save.next();
      save.complete();
      expect(api['reorder']).toHaveBeenCalledTimes(1);
      expect(api['reorder']).toHaveBeenCalledWith('p1', ['i2', 'i1']);
    });
  });
});

/** sow #8: error and concurrency states (B12, B14). */
describe('ScopeOfWorkPageComponent — errors (sow #8)', () => {
  let fixture: ComponentFixture<ScopeOfWorkPageComponent>;
  let el: HTMLElement;
  let api: Record<string, ReturnType<typeof vi.fn>>;
  let project: { getDetails: ReturnType<typeof vi.fn> };
  let toast: { show: ReturnType<typeof vi.fn> };
  let granted: Set<string>;

  const coded = (code: string, status: number) =>
    new HttpErrorResponse({ status, error: { title: code, status, errors: { [code]: ['x'] } } });

  beforeEach(() => {
    // crm-prod L-fe-5: the template picker also needs stages.read.
    granted = new Set([PERM.scope.read, PERM.scope.manage, PERM.scope.confirm, PERM.stages.read]);
    api = {
      getScope: vi.fn().mockReturnValue(of(scope({ canConfirm: true }))),
      updateHeader: vi.fn().mockReturnValue(of(undefined)),
      updateItem: vi.fn().mockReturnValue(of(undefined)),
      confirm: vi.fn().mockReturnValue(of({ createdStageIds: [] })),
    };
    project = {
      getDetails: vi
        .fn()
        .mockReturnValue(of(details({ id: 'p1', name: 'Villa', workflowType: 'Stage' }))),
    };
    toast = { show: vi.fn() };
    TestBed.configureTestingModule({
      imports: [ScopeOfWorkPageComponent],
      providers: [
        provideRouter([]),
        { provide: ScopeOfWorkService, useValue: api },
        { provide: ProjectService, useValue: project },
        { provide: PermissionsService, useValue: { can: (p: string) => granted.has(p) } },
        { provide: StageTemplatesService, useValue: { list: vi.fn(), stages: vi.fn() } },
        { provide: EmployeeService, useValue: { getById: vi.fn() } },
        { provide: ConfirmService, useValue: { open: vi.fn().mockResolvedValue(true) } },
        { provide: ToastService, useValue: toast },
      ],
    });
  });

  function render() {
    fixture = TestBed.createComponent(ScopeOfWorkPageComponent);
    fixture.componentRef.setInput('id', 'p1');
    fixture.detectChanges();
    el = fixture.nativeElement;
  }

  const confirmButton = () =>
    Array.from(el.querySelectorAll<HTMLButtonElement>('app-sow-summary pera-button button')).find(
      (b) => b.textContent!.trim() === EN['sow.confirmScope'],
    );

  async function pressConfirm() {
    confirmButton()!.click();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  it('a 404 shows the not-found state and nothing else (B14)', () => {
    api['getScope'].mockReturnValue(throwError(() => coded('projects.NotFound', 404)));
    render();
    expect(el.querySelector('[data-not-found]')!.textContent).toContain(EN['sow.notFound']);
    expect(el.querySelector('app-sow-summary')).toBeNull();
    expect(el.querySelector('app-sow-items-table')).toBeNull();
  });

  it('a 409 projects.scope.ConcurrentUpdate reloads and says "Changed by someone else" (B14)', () => {
    api['updateHeader'].mockReturnValue(
      throwError(() => coded('projects.scope.ConcurrentUpdate', 409)),
    );
    render();
    const input = el.querySelector<HTMLInputElement>('app-sow-summary pera-input input')!;
    input.value = '30';
    input.dispatchEvent(new Event('change', { bubbles: true }));
    fixture.detectChanges();
    expect(api['getScope']).toHaveBeenCalledTimes(2);
    expect(toast.show).toHaveBeenCalledWith({
      tone: 'info',
      message: 'Changed by someone else — reloaded.',
    });
    expect(el.querySelector('pera-alert[tone="danger"]')).toBeNull();
  });

  it('FINDING-7-4: a failed header save (409) reloads and puts the stored value back', async () => {
    const save = new Subject<void>();
    api['updateHeader'].mockReturnValue(save);
    render();
    await fixture.whenStable();
    const input = el.querySelector<HTMLInputElement>('app-sow-summary pera-input input')!;
    // As typed: `input` events, then `change` on commit.
    input.value = '30';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    fixture.detectChanges();
    await fixture.whenStable();
    save.error(coded('projects.scope.Confirmed', 409));
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(api['getScope']).toHaveBeenCalledTimes(2);
    expect(input.value).toBe('');
    expect(el.querySelector('pera-alert[tone="danger"]')!.textContent).toContain(
      'The scope of work is confirmed and can no longer be changed.',
    );
  });

  it('FINDING-7-4: a failed item save (404) reloads and puts the stored name back', async () => {
    const save = new Subject<void>();
    api['updateItem'].mockReturnValue(save);
    render();
    await fixture.whenStable();
    const input = el.querySelector<HTMLInputElement>('tbody tr pera-input input')!;
    // As typed: `input` events, then `change` on commit.
    input.value = 'Renamed';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    fixture.detectChanges();
    await fixture.whenStable();
    save.error(coded('projects.scope.ItemNotFound', 404));
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(api['getScope']).toHaveBeenCalledTimes(2);
    expect(input.value).toBe('Concept design');
  });

  it('FreeStyle: read-only with the WorkflowNotSupported message; confirm disabled (B12)', () => {
    project.getDetails.mockReturnValue(
      of(details({ id: 'p1', name: 'Villa', workflowType: 'FreeStyle' })),
    );
    api['getScope'].mockReturnValue(
      of(scope({ canConfirm: false, blockingReason: 'projects.scope.WorkflowNotSupported' })),
    );
    render();
    const message = 'Only a stage-workflow project has a scope of work.';
    expect(el.querySelector('[data-free-style]')!.textContent!.trim()).toBe(message);
    // FINDING-7-9: said once, by the page alert; the confirm block does not repeat it.
    expect(el.querySelector('[data-blocking-reason]')).toBeNull();
    expect(el.textContent!.split(message)).toHaveLength(2);
    expect(confirmButton()!.disabled).toBe(true);
    const inputs = Array.from(el.querySelectorAll<HTMLInputElement>('input, textarea'));
    expect(inputs.every((i) => i.disabled)).toBe(true);
    expect(el.querySelectorAll('tbody button')).toHaveLength(0);
  });

  it('FINDING-7-7: a 403 on the project read does not stop the page (it is not read)', () => {
    project.getDetails.mockReturnValue(throwError(() => coded('projects.AccessDenied', 403)));
    render();
    expect(project.getDetails).not.toHaveBeenCalled();
    expect(el.querySelector('app-sow-summary')).not.toBeNull();
    expect(el.querySelectorAll('tbody tr')).toHaveLength(2);
    expect(el.querySelector('pera-alert[tone="danger"]')).toBeNull();
  });

  it('crm-prod L-fe-6: with project.read the header shows the project name, code and client', () => {
    granted.add(PERM.projects.read);
    project.getDetails.mockReturnValue(
      of(details({ id: 'p1', name: 'Villa Rose', code: 'PRJ-7', clientName: 'Hana Saleh' })),
    );
    render();
    expect(project.getDetails).toHaveBeenCalledWith('p1');
    const header = el.querySelector('[data-project-header]')?.textContent?.replace(/\s+/g, ' ');
    expect(header).toContain('Villa Rose');
    expect(header).toContain('PRJ-7');
    expect(header).toContain('Client: Hana Saleh');
  });

  it('crm-prod L-fe-6: a failed project read leaves the header out and the page working', () => {
    granted.add(PERM.projects.read);
    project.getDetails.mockReturnValue(throwError(() => coded('projects.AccessDenied', 403)));
    render();
    expect(el.querySelector('[data-project-header]')).toBeNull();
    expect(el.querySelector('app-sow-summary')).not.toBeNull();
    expect(el.querySelector('pera-alert[tone="danger"]')).toBeNull();
  });

  it('FINDING-7-7: FreeStyle comes from the scope blockingReason alone', () => {
    api['getScope'].mockReturnValue(
      of(scope({ canConfirm: false, blockingReason: 'projects.scope.WorkflowNotSupported' })),
    );
    render();
    expect(el.querySelector('[data-free-style]')).not.toBeNull();
  });

  it('a Stage project shows no FreeStyle message', () => {
    render();
    expect(el.querySelector('[data-free-style]')).toBeNull();
  });

  it('confirm 403 projects.AccessDenied: inline at the button, no toast (B14)', async () => {
    api['confirm'].mockReturnValue(throwError(() => coded('projects.AccessDenied', 403)));
    render();
    await pressConfirm();
    expect(el.querySelector('[data-confirm-error]')!.textContent!.trim()).toBe(
      'You do not have access to this project.',
    );
    expect(toast.show).not.toHaveBeenCalled();
    expect(el.querySelector('pera-alert[tone="danger"]')).toBeNull();
    expect(api['getScope']).toHaveBeenCalledTimes(1);
  });

  it('confirm 409 teams.MissingHead: inline at the button, no toast (B14)', async () => {
    api['confirm'].mockReturnValue(throwError(() => coded('teams.MissingHead', 409)));
    render();
    await pressConfirm();
    expect(el.querySelector('[data-confirm-error]')!.textContent!.trim()).toBe(
      'A department in a picked stage has no head. Assign one first.',
    );
    expect(toast.show).not.toHaveBeenCalled();
  });

  it('a later successful action clears the confirm error', async () => {
    api['confirm'].mockReturnValueOnce(throwError(() => coded('teams.MissingHead', 409)));
    render();
    await pressConfirm();
    expect(el.querySelector('[data-confirm-error]')).not.toBeNull();
    await pressConfirm();
    expect(el.querySelector('[data-confirm-error]')).toBeNull();
  });
});

/**
 * crm-prod FINDING-P2-4: the header against the REAL ProjectService and the backend's JSON. `GET
 * /api/projects/{id}` answers `ProjectResponse` (ProjectContracts.cs:18-22 — no clientName); only
 * `GET /{id}/details` → `project` (`ProjectDetailsProjectResponse`, :66-70) carries `clientName`.
 */
describe('ScopeOfWorkPageComponent — project header from the backend shape (FINDING-P2-4)', () => {
  const projectJson = {
    id: 'p1',
    code: 'PRJ-7',
    name: 'Villa Rose',
    description: null,
    status: 2,
    workflowType: 1,
    address: 'Cairo',
    notes: null,
    progressPercentage: 0,
    estimatedStartDate: null,
    estimatedEndDate: null,
    actualStartDate: null,
    actualEndDate: null,
    clientId: 'c1',
    ownerId: 'e1',
    isActive: true,
    stageCount: 0,
  };

  it('shows the client name read from GET /projects/{id}/details', () => {
    TestBed.configureTestingModule({
      imports: [ScopeOfWorkPageComponent],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        ProjectService,
        {
          provide: ScopeOfWorkService,
          useValue: { getScope: vi.fn().mockReturnValue(of(scope())) },
        },
        { provide: PermissionsService, useValue: { can: () => true } },
        { provide: StageTemplatesService, useValue: { list: vi.fn(), stages: vi.fn() } },
        { provide: EmployeeService, useValue: { getById: vi.fn().mockReturnValue(of(null)) } },
        { provide: ConfirmService, useValue: { open: vi.fn() } },
      ],
    });
    const http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(ScopeOfWorkPageComponent);
    fixture.componentRef.setInput('id', 'p1');
    fixture.detectChanges();

    // Both project reads answer the backend's own shape; only /details is a ProjectDetailsResponse.
    http.match(`${environment.apiUrl}/projects/p1`).forEach((r) => r.flush(projectJson));
    http.match(`${environment.apiUrl}/projects/p1/details`).forEach((r) =>
      r.flush({
        project: { ...projectJson, clientName: 'Hana Saleh' },
        stages: [],
        unstagedTasks: [],
        taskCounts: [],
        gates: { total: 0, pending: 0, satisfied: 0, rejected: 0 },
      }),
    );
    fixture.detectChanges();

    const header = (fixture.nativeElement as HTMLElement)
      .querySelector('[data-project-header]')
      ?.textContent?.replace(/\s+/g, ' ');
    expect(header).toContain('Villa Rose');
    expect(header).toContain('Client: Hana Saleh');
    http.verify();
  });
});

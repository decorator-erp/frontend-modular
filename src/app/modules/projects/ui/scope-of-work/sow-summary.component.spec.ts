import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, expect, it, beforeEach } from 'vitest';
import { friendlyMessage } from '@platform/errors/error-catalog';
import { EN } from '@platform/i18n/catalog/en';
import { formatCairoDate } from '@platform/i18n/intl-locale';
import {
  ScopeOfWork,
  ScopeOfWorkStatus,
  UpdateScopeOfWorkHeaderRequest,
} from '../../model/scope-of-work.model';
import { SowSummaryComponent } from './sow-summary.component';

function scope(over: Partial<ScopeOfWork> = {}): ScopeOfWork {
  return {
    id: 'sow1',
    projectId: 'p1',
    status: ScopeOfWorkStatus.Draft,
    durationDays: 120,
    plannedStartDate: '2026-11-01',
    estimatedEndDate: '2027-03-01',
    subtotal: 55000,
    adjustmentAmount: -5000,
    adjustmentNote: 'Early-payment discount',
    total: 50000,
    notes: 'Fees exclude furniture.',
    confirmedAtUtc: null,
    confirmedById: null,
    items: [],
    canConfirm: true,
    blockingReason: null,
    ...over,
  };
}

describe('SowSummaryComponent — duration and dates (sow #5)', () => {
  let fixture: ComponentFixture<SowSummaryComponent>;
  let el: HTMLElement;
  let emitted: UpdateScopeOfWorkHeaderRequest[];

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [SowSummaryComponent] });
  });

  function render(s: ScopeOfWork, editable = true, saveStatus = 'idle') {
    fixture = TestBed.createComponent(SowSummaryComponent);
    fixture.componentRef.setInput('scope', s);
    fixture.componentRef.setInput('editable', editable);
    fixture.componentRef.setInput('saveStatus', saveStatus);
    emitted = [];
    fixture.componentInstance.headerChange.subscribe((r) => emitted.push(r));
    fixture.detectChanges();
    el = fixture.nativeElement;
  }

  const durationInput = () => el.querySelector<HTMLInputElement>('pera-input input')!;
  const startInput = () => el.querySelector<HTMLInputElement>('pera-date-input input')!;
  const end = () => el.querySelector('[data-estimated-end]')!.textContent!.trim();

  function change(input: HTMLInputElement, value: string) {
    input.value = value;
    input.dispatchEvent(new Event('change', { bubbles: true }));
    fixture.detectChanges();
  }

  it('a duration change sends ONE full header with all five fields (B7, B9)', () => {
    render(scope());
    change(durationInput(), '90');
    expect(emitted).toEqual([
      {
        durationDays: 90,
        plannedStartDate: '2026-11-01',
        adjustmentAmount: -5000,
        adjustmentNote: 'Early-payment discount',
        notes: 'Fees exclude furniture.',
      },
    ]);
  });

  it('a start change sends the full header; adjustmentAmount is always sent (B9)', () => {
    render(scope({ adjustmentAmount: 0, adjustmentNote: null, notes: null }));
    change(startInput(), '2026-12-15');
    expect(emitted).toEqual([
      {
        durationDays: 120,
        plannedStartDate: '2026-12-15',
        adjustmentAmount: 0,
        adjustmentNote: null,
        notes: null,
      },
    ]);
  });

  it('clearing the duration or the start sends null', () => {
    render(scope());
    change(durationInput(), '');
    change(startInput(), '');
    expect(emitted.map((r) => r.durationDays)).toEqual([null, 120]);
    expect(emitted[1].plannedStartDate).toBeNull();
  });

  it('duration outside 1..3650 or not whole is blocked with a message (B7)', () => {
    render(scope());
    for (const bad of ['0', '3651', '1.5']) change(durationInput(), bad);
    expect(emitted).toEqual([]);
    expect(el.textContent).toContain(EN['sow.durationInvalid']);
    change(durationInput(), '3650');
    expect(emitted).toHaveLength(1);
    expect(el.textContent).not.toContain(EN['sow.durationInvalid']);
  });

  it('FINDING-7-3: an unparsable duration (badInput) is invalid, not a clear', () => {
    render(scope());
    const input = durationInput();
    Object.defineProperty(input, 'validity', { value: { badInput: true }, configurable: true });
    change(input, '');
    expect(emitted).toEqual([]);
    expect(el.textContent).toContain(EN['sow.durationInvalid']);
  });

  it('a start outside 2000-01-01..2100-12-31 is blocked (B7)', () => {
    render(scope());
    change(startInput(), '1999-12-31');
    expect(emitted).toEqual([]);
    expect(el.textContent).toContain(EN['sow.startInvalid']);
  });

  it('an unchanged value sends nothing', () => {
    render(scope());
    change(durationInput(), '120');
    expect(emitted).toEqual([]);
  });

  it("the estimated end is the server's estimatedEndDate, not computed (B7)", () => {
    // 2026-11-01 + 120 days is 2027-03-01; the server says otherwise and wins.
    render(scope({ estimatedEndDate: '2027-02-28' }));
    expect(end()).toBe(formatCairoDate('2027-02-28T00:00:00Z', 'en'));
    expect(end()).toMatch(/Feb 28, 2027|28 Feb 2027/);
  });

  it('"Set a start date" before a start; "—" with no duration (B7)', () => {
    render(scope({ plannedStartDate: null, estimatedEndDate: null }));
    expect(end()).toBe(EN['sow.setStartDate']);
    fixture.componentRef.setInput(
      'scope',
      scope({ durationDays: null, plannedStartDate: '2026-11-01', estimatedEndDate: null }),
    );
    fixture.detectChanges();
    expect(end()).toBe('—');
  });

  it('read-only: inputs disabled and no change is sent', () => {
    render(scope(), false);
    expect(durationInput().disabled).toBe(true);
    expect(startInput().disabled).toBe(true);
    change(durationInput(), '90');
    expect(emitted).toEqual([]);
  });

  it('quiet Saving… / Saved status (B9)', () => {
    render(scope(), true, 'saving');
    const status = () => el.querySelector('[role="status"]')!.textContent!.trim();
    expect(status()).toBe(EN['sow.saving']);
    fixture.componentRef.setInput('saveStatus', 'saved');
    fixture.detectChanges();
    expect(status()).toBe(EN['sow.saved']);
    fixture.componentRef.setInput('saveStatus', 'idle');
    fixture.detectChanges();
    expect(status()).toBe('');
  });

  it('the inputs carry accessible names', () => {
    render(scope());
    fixture.detectChanges();
    expect(durationInput().getAttribute('aria-label')).toBe(EN['sow.durationDays']);
    expect(startInput().getAttribute('aria-label')).toBe(EN['sow.plannedStart']);
  });
});

describe('SowSummaryComponent — fees and adjustment (sow #6)', () => {
  let fixture: ComponentFixture<SowSummaryComponent>;
  let el: HTMLElement;
  let emitted: UpdateScopeOfWorkHeaderRequest[];

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [SowSummaryComponent] });
  });

  function render(s: ScopeOfWork, editable = true) {
    fixture = TestBed.createComponent(SowSummaryComponent);
    fixture.componentRef.setInput('scope', s);
    fixture.componentRef.setInput('editable', editable);
    emitted = [];
    fixture.componentInstance.headerChange.subscribe((r) => emitted.push(r));
    fixture.detectChanges();
    el = fixture.nativeElement;
  }

  const adjustmentInput = () => el.querySelector<HTMLInputElement>('pera-money-input input')!;
  const noteField = () => el.querySelector('[data-adjustment-note]');
  const noteInput = () => el.querySelector<HTMLInputElement>('[data-adjustment-note] input')!;
  const notesInput = () => el.querySelector<HTMLTextAreaElement>('pera-textarea textarea')!;
  const text = (sel: string) => el.querySelector(sel)!.textContent!.replace(/\s+/g, '');

  function change(input: HTMLInputElement | HTMLTextAreaElement, value: string) {
    input.value = value;
    input.dispatchEvent(new Event('change', { bubbles: true }));
    fixture.detectChanges();
  }

  it('subtotal and total are the server values, in EGP via pera-currency (B8)', () => {
    // Items 30,000 + 25,000 would be 55,000; the server's numbers are shown, not recomputed.
    render(scope({ subtotal: 54321, adjustmentAmount: -321, total: 54000 }));
    expect(el.querySelector('pera-currency[data-subtotal]')).not.toBeNull();
    expect(text('[data-subtotal]')).toBe('54,321.00EGP');
    expect(text('[data-total]')).toBe('54,000.00EGP');
  });

  it('the reason field shows only while the adjustment is not 0 (B8)', () => {
    render(scope({ adjustmentAmount: 0, adjustmentNote: null }));
    expect(noteField()).toBeNull();
    change(adjustmentInput(), '-5000');
    expect(noteField()).not.toBeNull();
    expect(noteInput().getAttribute('aria-label')).toBe(EN['sow.adjustmentNote']);
    change(adjustmentInput(), '0');
    expect(noteField()).toBeNull();
  });

  it('a stored non-zero adjustment shows its reason', async () => {
    render(scope());
    await fixture.whenStable();
    fixture.detectChanges();
    expect(noteInput().value).toBe('Early-payment discount');
  });

  it('a negative adjustment (a discount) sends the full header (B8, B9)', () => {
    render(scope({ adjustmentAmount: 0, adjustmentNote: null }));
    change(adjustmentInput(), '-7,500');
    expect(emitted).toEqual([
      {
        durationDays: 120,
        plannedStartDate: '2026-11-01',
        adjustmentAmount: -7500,
        adjustmentNote: null,
        notes: 'Fees exclude furniture.',
      },
    ]);
  });

  it('crm-prod L-fe-2: an adjustment typed in Arabic-Indic digits parses', () => {
    render(scope({ adjustmentAmount: 0, adjustmentNote: null }));
    change(adjustmentInput(), '-٧٬٥٠٠٫٢٥');
    expect(emitted.map((h) => h.adjustmentAmount)).toEqual([-7500.25]);
    expect(el.textContent).not.toContain(EN['sow.adjustmentInvalid']);
  });

  it('an adjustment beyond ±1e12 is blocked', () => {
    render(scope());
    change(adjustmentInput(), '-1000000000001');
    expect(emitted).toEqual([]);
    expect(el.textContent).toContain(EN['sow.adjustmentInvalid']);
  });

  it('the reason sends the full header; over 500 characters is blocked (B8)', () => {
    render(scope());
    change(noteInput(), 'x'.repeat(501));
    expect(emitted).toEqual([]);
    expect(el.textContent).toContain(EN['sow.adjustmentNoteInvalid']);
    change(noteInput(), 'Loyalty discount');
    expect(emitted).toEqual([
      {
        durationDays: 120,
        plannedStartDate: '2026-11-01',
        adjustmentAmount: -5000,
        adjustmentNote: 'Loyalty discount',
        notes: 'Fees exclude furniture.',
      },
    ]);
  });

  it('notes send the full header; over 2000 characters is blocked; empty is null (B8)', () => {
    render(scope());
    expect(notesInput().getAttribute('aria-label')).toBe(EN['sow.notes']);
    change(notesInput(), 'y'.repeat(2001));
    expect(emitted).toEqual([]);
    expect(el.textContent).toContain(EN['sow.notesInvalid']);
    change(notesInput(), '   ');
    expect(emitted).toHaveLength(1);
    expect(emitted[0].notes).toBeNull();
    expect(emitted[0].adjustmentAmount).toBe(-5000);
  });

  it('read-only: the fee inputs are disabled', () => {
    render(scope(), false);
    expect(adjustmentInput().disabled).toBe(true);
    expect(noteInput().disabled).toBe(true);
    expect(notesInput().disabled).toBe(true);
  });
});

describe('SowSummaryComponent — confirm block (sow #7)', () => {
  let fixture: ComponentFixture<SowSummaryComponent>;
  let el: HTMLElement;
  let confirms: number;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [SowSummaryComponent] });
  });

  function render(s: ScopeOfWork, confirmPermitted = true, editable = true) {
    fixture = TestBed.createComponent(SowSummaryComponent);
    fixture.componentRef.setInput('scope', s);
    fixture.componentRef.setInput('editable', editable);
    fixture.componentRef.setInput('confirmPermitted', confirmPermitted);
    confirms = 0;
    fixture.componentInstance.confirm.subscribe(() => confirms++);
    fixture.detectChanges();
    el = fixture.nativeElement;
  }

  const button = () =>
    Array.from(el.querySelectorAll<HTMLButtonElement>('pera-button button')).find(
      (b) => b.textContent!.trim() === EN['sow.confirmScope'],
    );
  const reason = () => el.querySelector('[data-blocking-reason]')?.textContent?.trim() ?? null;

  it('enabled when canConfirm and scope.confirm; emits on click; copy names the stage count', () => {
    render(scope({ items: [sowItemLike('i1'), sowItemLike('i2')] }));
    expect(button()!.disabled).toBe(false);
    expect(reason()).toBeNull();
    expect(el.textContent).toContain(
      "Confirming creates 2 stages with their tasks, teams and cost, in this order. It can't be undone.",
    );
    button()!.click();
    expect(confirms).toBe(1);
  });

  it('crm-prod L-fe-1: one item reads "1 stage", not "1 stages"', () => {
    render(scope({ items: [sowItemLike('i1')] }));
    expect(el.textContent).toContain('Confirming creates 1 stage with their tasks');
    expect(el.textContent).not.toContain('1 stages');
  });

  it("disabled with the blocking reason's catalog message when canConfirm is false (B10)", () => {
    render(scope({ canConfirm: false, blockingReason: 'projects.scope.DurationRequired' }));
    expect(button()!.disabled).toBe(true);
    expect(reason()).toBe(friendlyMessage('projects.scope.DurationRequired', '', 'en'));
    button()!.click();
    expect(confirms).toBe(0);
  });

  it('disabled without scope.confirm, even when the server could confirm (B10, B15)', () => {
    render(scope({ canConfirm: true, blockingReason: null }), false);
    expect(button()!.disabled).toBe(true);
    expect(reason()).toBe(EN['sow.confirmNoPermission']);
  });

  it('confirmed: no confirm block, the read-only footer, inputs disabled (B11)', () => {
    render(
      scope({ status: ScopeOfWorkStatus.Confirmed, blockingReason: 'projects.scope.Confirmed' }),
      true,
      false,
    );
    expect(el.querySelector('[data-confirm-block]')).toBeNull();
    expect(button()).toBeUndefined();
    expect(el.querySelector('[data-read-only-footer]')!.textContent!.trim()).toBe(
      EN['sow.readOnlyFooter'],
    );
    const inputs = Array.from(el.querySelectorAll<HTMLInputElement>('input, textarea'));
    expect(inputs.length).toBeGreaterThan(0);
    expect(inputs.every((i) => i.disabled)).toBe(true);
  });
});

function sowItemLike(id: string) {
  return {
    id,
    sourceStageId: `s-${id}`,
    sourceTemplateName: 'Residential',
    name: id,
    description: null,
    order: 1,
    fee: 1,
    createdStageId: null,
    sourceMissing: false,
  };
}

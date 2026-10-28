import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, expect, it, beforeEach } from 'vitest';
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

import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { of, throwError } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { CrmApprovalsService } from '../../data/crm-approvals.service';
import { CrmBriefService } from '../../data/crm-brief.service';
import { ApprovalState } from '../../model/crm-enums';
import type { BriefHead, BriefHeadDiff, BriefRound } from '../../model';
import { BriefStore } from '../../stores/brief.store';
import { CrmBriefRoundsComponent, ROUND_OUTCOME } from './brief-rounds.component';

const HEAD = {
  id: 'B',
  projectId: 'P',
  projectStageId: 'S',
  status: ApprovalState.PendingApproval,
} as unknown as BriefHead;

const round = (n: number, outcome: number): BriefRound => ({
  round: n,
  sentAtUtc: '2026-07-01T08:00:00Z',
  outcome,
  decidedAtUtc: null,
});

const DIFF_2: BriefHeadDiff = {
  briefId: 'B',
  round: 2,
  previousRound: 1,
  changes: [{ field: 'AreaSqm', previousValue: '120', currentValue: '140' }],
};

function make(rounds: BriefRound[], getHeadDiff = vi.fn().mockReturnValue(of(DIFF_2))) {
  const api = {
    getBrief: vi.fn().mockReturnValue(of(HEAD)),
    getBriefByStage: vi.fn().mockReturnValue(of(HEAD)),
    listSpaces: vi.fn().mockReturnValue(of([])),
    listRounds: vi.fn().mockReturnValue(of(rounds)),
    getHeadDiff,
  };
  TestBed.configureTestingModule({
    imports: [CrmBriefRoundsComponent],
    providers: [
      BriefStore,
      { provide: CrmBriefService, useValue: api },
      { provide: CrmApprovalsService, useValue: { bySubject: vi.fn().mockReturnValue(of([])) } },
    ],
  });
  TestBed.inject(BriefStore).load('P');
  const fixture = TestBed.createComponent(CrmBriefRoundsComponent);
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  const render = () => {
    fixture.detectChanges();
    return el;
  };
  return { el, render, api };
}

describe('CrmBriefRoundsComponent (crm-prod M5)', () => {
  it('lists every round with its outcome', () => {
    const { el } = make([
      round(1, ROUND_OUTCOME.ChangesRequested),
      round(2, ROUND_OUTCOME.Pending),
    ]);
    const rows = Array.from(el.querySelectorAll('[data-testid="brief-round"]'));
    expect(rows).toHaveLength(2);
    expect(rows[0].textContent).toContain('Round 1');
    expect(rows[0].textContent).toContain('Changes requested');
    expect(rows[1].textContent).toContain('Round 2');
    expect(rows[1].textContent).toContain('Awaiting client');
  });

  it('says so when nothing was sent yet', () => {
    const { el } = make([]);
    expect(el.querySelectorAll('[data-testid="brief-round"]')).toHaveLength(0);
    expect(el.textContent).toContain('has not been sent to the client yet');
  });

  it("opens a round's diff with formatted previous and current values, and closes it", () => {
    const { el, render, api } = make([
      round(1, ROUND_OUTCOME.ChangesRequested),
      round(2, ROUND_OUTCOME.Pending),
    ]);
    const second = el.querySelectorAll('[data-testid="brief-round"]')[1];
    (second.querySelector('button') as HTMLButtonElement).click();
    render();

    expect(api.getHeadDiff).toHaveBeenCalledWith('B', 2);
    const diff = el.querySelector('[data-testid="brief-round-diff"]');
    expect(diff?.textContent).toContain('120');
    expect(diff?.textContent).toContain('140');
    expect(diff?.textContent).toContain('→');

    (second.querySelector('button') as HTMLButtonElement).click();
    expect(render().querySelector('[data-testid="brief-round-diff"]')).toBeNull();
  });

  it('shows the diff failure instead of the changes', () => {
    const { el, render } = make(
      [round(1, ROUND_OUTCOME.Pending)],
      vi.fn().mockReturnValue(throwError(() => new HttpErrorResponse({ status: 500 }))),
    );
    (el.querySelector('[data-testid="brief-round"] button') as HTMLButtonElement).click();
    expect(render().querySelector('[data-testid="brief-round-diff"]')?.textContent).toContain(
      'Could not load the round changes.',
    );
  });

  it('shows an approved banner when the latest round was approved', () => {
    const { el } = make([
      round(1, ROUND_OUTCOME.ChangesRequested),
      round(2, ROUND_OUTCOME.Approved),
    ]);
    expect(el.querySelector('[data-testid="brief-round-banner"]')?.textContent).toContain(
      'The client approved round 2.',
    );
  });

  it('shows a changes-requested banner when the latest round asked for changes', () => {
    const { el } = make([round(1, ROUND_OUTCOME.ChangesRequested)]);
    expect(el.querySelector('[data-testid="brief-round-banner"]')?.textContent).toContain(
      'The client requested changes to round 1.',
    );
  });

  it('shows no banner while the latest round is pending', () => {
    const { el } = make([round(1, ROUND_OUTCOME.Approved), round(2, ROUND_OUTCOME.Pending)]);
    expect(el.querySelector('[data-testid="brief-round-banner"]')).toBeNull();
  });
});

import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { describe, expect, it, vi } from 'vitest';
import { BriefStore } from '../../stores/brief.store';
import { CrmBriefRoundsComponent, ROUND_OUTCOME } from './brief-rounds.component';

/** Sync F4d: the rounds section in the client portal speaks to the client. */
describe('CrmBriefRoundsComponent — client audience (sync F4d)', () => {
  function render(audience: 'office' | 'client', outcome: number) {
    const round = { round: 2, sentAtUtc: '2026-10-02T10:00:00Z', outcome, decidedAtUtc: null };
    TestBed.configureTestingModule({
      imports: [CrmBriefRoundsComponent],
      providers: [
        {
          provide: BriefStore,
          useValue: {
            rounds: signal([round]),
            latestRound: signal(round),
            diffRound: signal(null),
            toggleRoundDiff: vi.fn(),
          },
        },
      ],
    });
    const f = TestBed.createComponent(CrmBriefRoundsComponent);
    f.componentRef.setInput('audience', audience);
    f.detectChanges();
    return (f.nativeElement as HTMLElement).querySelector('[data-testid="brief-round-banner"]')
      ?.textContent;
  }

  it.each([
    ['office', ROUND_OUTCOME.Approved, 'The client approved round 2.'],
    ['client', ROUND_OUTCOME.Approved, 'You approved round 2.'],
    ['client', ROUND_OUTCOME.ChangesRequested, 'You asked for changes in round 2.'],
  ] as const)('%s, outcome %s → %s', (audience, outcome, text) => {
    expect(render(audience, outcome)).toContain(text);
  });
});

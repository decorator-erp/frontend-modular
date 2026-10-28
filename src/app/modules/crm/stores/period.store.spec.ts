import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { NEVER, of, throwError } from 'rxjs';
import { CrmPeriod, CrmPeriodService } from '../data/crm-period.service';
import { RequirementPeriodStatus } from '../model/crm-enums';
import { PeriodStore } from './period.store';

const PROJECT_ID = 'project-1';

function period(over: Partial<CrmPeriod> = {}): CrmPeriod {
  return {
    id: 'period-1',
    projectId: PROJECT_ID,
    projectStageId: null,
    status: RequirementPeriodStatus.Open,
    closesAtUtc: '2026-07-20T18:00:00.000Z',
    closedAtUtc: null,
    openedById: 'employee-1',
    ...over,
  };
}

function periodApiMock() {
  return {
    list: vi.fn().mockReturnValue(of([period()])),
    extend: vi.fn().mockReturnValue(of(undefined)),
    close: vi.fn().mockReturnValue(of(undefined)),
    open: vi.fn(),
  };
}

describe('PeriodStore', () => {
  let api: ReturnType<typeof periodApiMock>;

  beforeEach(() => {
    vi.useFakeTimers();
    api = periodApiMock();
    TestBed.configureTestingModule({
      providers: [PeriodStore, { provide: CrmPeriodService, useValue: api }],
    });
  });

  afterEach(() => vi.useRealTimers());

  const store = () => TestBed.inject(PeriodStore);

  describe('load()', () => {
    it('fetches the project history and clears loading', () => {
      const s = store();

      s.load(PROJECT_ID);

      expect(api.list).toHaveBeenCalledWith(PROJECT_ID);
      expect(s.periods()).toHaveLength(1);
      expect(s.loading()).toBe(false);
      expect(s.error()).toBeNull();
    });

    it('sets loading true while the request is in flight', () => {
      api.list.mockReturnValueOnce(NEVER); // never emits — freezes mid-request
      const s = store();

      s.load(PROJECT_ID);

      expect(s.loading()).toBe(true);
    });

    it('surfaces a friendly error and clears loading on failure', () => {
      api.list.mockReturnValue(throwError(() => new Error('network down')));
      const s = store();

      s.load(PROJECT_ID);

      expect(s.error()).toBe('Could not load the requirement period.');
      expect(s.loading()).toBe(false);
      expect(s.periods()).toEqual([]);
    });

    it('clears a previous error on a fresh load', () => {
      api.list.mockReturnValueOnce(throwError(() => new Error('boom')));
      const s = store();
      s.load(PROJECT_ID);
      expect(s.error()).not.toBeNull();

      api.list.mockReturnValue(of([period()]));
      s.load(PROJECT_ID);

      expect(s.error()).toBeNull();
    });
  });

  describe('derived selectors', () => {
    it('derives openPeriod from the ONE Open record in the history', () => {
      const closed = period({ id: 'p-old', status: RequirementPeriodStatus.Closed });
      const open = period({ id: 'p-current', status: RequirementPeriodStatus.Open });
      api.list.mockReturnValue(of([closed, open]));
      const s = store();

      s.load(PROJECT_ID);

      expect(s.openPeriod()?.id).toBe('p-current');
      expect(s.isOpen()).toBe(true);
    });

    it('openPeriod is null and isOpen is false when every period is closed', () => {
      api.list.mockReturnValue(of([period({ status: RequirementPeriodStatus.Closed })]));
      const s = store();

      s.load(PROJECT_ID);

      expect(s.openPeriod()).toBeNull();
      expect(s.isOpen()).toBe(false);
    });

    it('openPeriod is null with no periods at all (never opened)', () => {
      api.list.mockReturnValue(of([]));
      const s = store();

      s.load(PROJECT_ID);

      expect(s.openPeriod()).toBeNull();
      expect(s.isOpen()).toBe(false);
    });

    // The countdown — computed as a snapshot at load time, not a live tick (a `computed()`
    // only re-derives on a tracked-signal change, and "now" is not one; a ticking display
    // is the future component's job).
    describe('the countdown (msRemaining / daysRemaining)', () => {
      it('is null when there is no open period', () => {
        api.list.mockReturnValue(of([period({ status: RequirementPeriodStatus.Closed })]));
        const s = store();
        s.load(PROJECT_ID);

        expect(s.msRemaining()).toBeNull();
        expect(s.daysRemaining()).toBeNull();
      });

      it('computes exact milliseconds remaining against a pinned clock', () => {
        vi.setSystemTime(new Date('2026-07-18T18:00:00.000Z')); // 2 days before closesAtUtc
        const s = store();

        s.load(PROJECT_ID); // closesAtUtc: 2026-07-20T18:00:00.000Z

        expect(s.msRemaining()).toBe(2 * 86_400_000);
        expect(s.daysRemaining()).toBe(2);
      });

      it('rounds UP — a period closing in 40 minutes reads as 1 day left, not 0', () => {
        vi.setSystemTime(new Date('2026-07-20T17:20:00.000Z')); // 40 min before close
        const s = store();

        s.load(PROJECT_ID);

        expect(s.daysRemaining()).toBe(1);
      });

      it('goes negative once the close time has passed, rather than clamping to zero', () => {
        vi.setSystemTime(new Date('2026-07-22T18:00:00.000Z')); // 2 days AFTER closesAtUtc
        const s = store();

        s.load(PROJECT_ID);

        expect(s.msRemaining()).toBe(-2 * 86_400_000);
        expect(s.daysRemaining()).toBe(-2);
      });

      it('re-derives when the store reloads to a different open period', () => {
        vi.setSystemTime(new Date('2026-07-18T18:00:00.000Z'));
        const s = store();
        s.load(PROJECT_ID);
        expect(s.daysRemaining()).toBe(2);

        api.list.mockReturnValue(
          of([period({ closesAtUtc: '2026-07-19T18:00:00.000Z' })]), // now 1 day out
        );
        s.load(PROJECT_ID);

        expect(s.daysRemaining()).toBe(1);
      });
    });
  });

  describe('extend()', () => {
    it('calls the api and reloads the project on success', () => {
      const s = store();
      s.load(PROJECT_ID);
      api.list.mockClear();

      s.extend('period-1', '2026-07-27T18:00:00.000Z');

      expect(api.extend).toHaveBeenCalledWith('period-1', '2026-07-27T18:00:00.000Z');
      expect(api.list).toHaveBeenCalledWith(PROJECT_ID); // refreshed from the server
      expect(s.extending()).toBe(false);
      expect(s.error()).toBeNull();
    });

    it('sets extending true while in flight', () => {
      api.extend.mockReturnValueOnce(NEVER);
      const s = store();
      s.load(PROJECT_ID);

      s.extend('period-1', '2026-07-27T18:00:00.000Z');

      expect(s.extending()).toBe(true);
    });

    it('surfaces a friendly error and does NOT reload on failure', () => {
      api.extend.mockReturnValue(throwError(() => new Error('boom')));
      const s = store();
      s.load(PROJECT_ID);
      api.list.mockClear();

      s.extend('period-1', '2026-07-27T18:00:00.000Z');

      expect(s.error()).toBe('Could not extend the requirement period.');
      expect(s.extending()).toBe(false);
      expect(api.list).not.toHaveBeenCalled();
    });

    it('is a no-op reload when no project has been loaded yet', () => {
      const s = store();

      s.extend('period-1', '2026-07-27T18:00:00.000Z');

      expect(api.list).not.toHaveBeenCalled();
      expect(s.extending()).toBe(false);
    });
  });

  describe('close()', () => {
    it('calls the api and reloads the project on success', () => {
      const s = store();
      s.load(PROJECT_ID);
      api.list.mockClear();

      s.close('period-1');

      expect(api.close).toHaveBeenCalledWith('period-1');
      expect(api.list).toHaveBeenCalledWith(PROJECT_ID);
      expect(s.closing()).toBe(false);
      expect(s.error()).toBeNull();
    });

    it('sets closing true while in flight', () => {
      api.close.mockReturnValueOnce(NEVER);
      const s = store();
      s.load(PROJECT_ID);

      s.close('period-1');

      expect(s.closing()).toBe(true);
    });

    it('surfaces a friendly error and does NOT reload on failure', () => {
      api.close.mockReturnValue(throwError(() => new Error('boom')));
      const s = store();
      s.load(PROJECT_ID);
      api.list.mockClear();

      s.close('period-1');

      expect(s.error()).toBe('Could not close the requirement period.');
      expect(s.closing()).toBe(false);
      expect(api.list).not.toHaveBeenCalled();
    });
  });
});

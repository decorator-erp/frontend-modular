import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { NEVER, of, throwError } from 'rxjs';
import { CrmApprovalsService } from '../data/crm-approvals.service';
import { ApprovalDecision, ApprovalSubjectType } from '../model/crm-enums';
import type { ClientApprovalTrailRow } from '../model';
import { ApprovalsInboxStore } from './approvals-inbox.store';

function row(over: Partial<ClientApprovalTrailRow> = {}): ClientApprovalTrailRow {
  return {
    id: 'a1',
    subjectType: ApprovalSubjectType.DesignBrief,
    subjectId: 'brief-1',
    projectId: 'project-1',
    projectName: 'Villa Kafr El-Sheikh',
    round: 3,
    createdAtUtc: '2026-07-03T09:00:00.000Z',
    decision: null,
    decidedAtUtc: null,
    comment: null,
    responseDueAtUtc: null,
    trackKey: 'a1',
    ...over,
  };
}

function apiMock() {
  return {
    portalPending: vi.fn().mockReturnValue(of([row()])),
    decideAsClient: vi.fn().mockReturnValue(of(undefined)),
  };
}

describe('ApprovalsInboxStore', () => {
  let api: ReturnType<typeof apiMock>;

  beforeEach(() => {
    api = apiMock();
    TestBed.configureTestingModule({
      providers: [ApprovalsInboxStore, { provide: CrmApprovalsService, useValue: api }],
    });
  });

  const store = () => TestBed.inject(ApprovalsInboxStore);

  describe('load()', () => {
    it('fetches every row — pending and decided alike', () => {
      const s = store();
      s.load();
      expect(api.portalPending).toHaveBeenCalled();
      expect(s.rows()).toHaveLength(1);
      expect(s.loading()).toBe(false);
    });

    it('sets loading true while in flight', () => {
      api.portalPending.mockReturnValueOnce(NEVER);
      const s = store();
      s.load();
      expect(s.loading()).toBe(true);
    });

    it('surfaces a catalog KEY on failure', () => {
      api.portalPending.mockReturnValue(throwError(() => new Error('boom')));
      const s = store();
      s.load();
      expect(s.error()).toBe('client.profileUnavailable');
      expect(s.loading()).toBe(false);
    });
  });

  describe('derived selectors', () => {
    it('pending is every row with decision === null', () => {
      api.portalPending.mockReturnValue(
        of([
          row({ id: 'a1', decision: null }),
          row({ id: 'a2', decision: ApprovalDecision.Approved }),
        ]),
      );
      const s = store();
      s.load();
      expect(s.pending().map((r) => r.id)).toEqual(['a1']);
    });

    it('decided sorts most-recently-decided first', () => {
      api.portalPending.mockReturnValue(
        of([
          row({
            id: 'older',
            decision: ApprovalDecision.Approved,
            decidedAtUtc: '2026-07-01T00:00:00.000Z',
          }),
          row({
            id: 'newer',
            decision: ApprovalDecision.Rejected,
            decidedAtUtc: '2026-07-05T00:00:00.000Z',
          }),
        ]),
      );
      const s = store();
      s.load();
      expect(s.decided().map((r) => r.id)).toEqual(['newer', 'older']);
    });

    it('a rejected row STAYS in decided, never disappears (append-only trail, FR-029)', () => {
      api.portalPending.mockReturnValue(
        of([row({ id: 'a1', decision: ApprovalDecision.Rejected, comment: 'Wrong floor.' })]),
      );
      const s = store();
      s.load();
      expect(s.decided()).toHaveLength(1);
      expect(s.decided()[0].comment).toBe('Wrong floor.');
    });
  });

  describe('decide()', () => {
    it('calls the api and reloads on success', () => {
      const s = store();
      s.load();
      api.portalPending.mockClear();

      s.decide('a1', { decision: ApprovalDecision.Approved, comment: null });

      expect(api.decideAsClient).toHaveBeenCalledWith('a1', {
        decision: ApprovalDecision.Approved,
        comment: null,
      });
      expect(api.portalPending).toHaveBeenCalled();
      expect(s.decidingId()).toBeNull();
    });

    it('surfaces a catalog KEY when the api call fails', () => {
      api.decideAsClient.mockReturnValue(throwError(() => new Error('403')));
      const s = store();

      s.decide('a1', { decision: ApprovalDecision.Approved, comment: null });

      expect(s.error()).toBe('appr.decideFailed');
      expect(s.decidingId()).toBeNull();
    });

    it('does not crash if the api throws synchronously (the reject-without-comment guard)', () => {
      api.decideAsClient.mockImplementation(() => {
        throw new Error('A comment is required when rejecting an approval.');
      });
      const s = store();

      expect(() =>
        s.decide('a1', { decision: ApprovalDecision.Rejected, comment: null }),
      ).not.toThrow();
      expect(s.error()).toBe('appr.decideFailed');
    });
  });
});

import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { ApprovalDecision, ApprovalSubjectType } from '../model/crm-enums';
import { environment } from '../../../../environments/environment';
import { CrmApprovalsService } from './crm-approvals.service';

describe('CrmApprovalsService', () => {
  let service: CrmApprovalsService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [CrmApprovalsService, provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(CrmApprovalsService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  const url = (path: string) => `${environment.apiUrl}${path}`;

  // Everything on the wire is a bare integer EXCEPT these two fields, which are
  // hand-serialized as strings. One payload, two conventions. No string enum may reach
  // a store, so both are mapped at this boundary.
  describe('the two hand-serialized string enums', () => {
    it('maps ClientApprovalTrailResponse.SubjectType from its STRING name to the enum', () => {
      let subjectType: ApprovalSubjectType | undefined;
      service.portalPending().subscribe((r) => (subjectType = r[0].subjectType));

      http.expectOne(url('/crm/portal/approvals')).flush([
        {
          id: 'a1',
          subjectType: 'DesignBrief', // ← a STRING, while roundNumber beside it is an int
          subjectId: 'brief-1',
          projectId: 'project-1',
          projectName: 'Villa Kafr El-Sheikh',
          roundNumber: 3,
          createdAtUtc: '2026-07-03T09:00:00Z',
          decision: null,
          decidedAtUtc: null,
          comment: null,
          responseDueAtUtc: null,
        },
      ]);

      expect(subjectType).toBe(ApprovalSubjectType.DesignBrief);
      expect(typeof subjectType).toBe('number');
    });

    it('maps ApprovalTrailItemResponse.Decision from its STRING name to the enum', () => {
      let decisions: (ApprovalDecision | null)[] = [];
      service
        .bySubject(ApprovalSubjectType.DesignBrief, 'brief-1')
        .subscribe((r) => (decisions = r.map((t) => t.decision)));

      http.expectOne(url('/approvals/by-subject/2/brief-1')).flush([
        { id: 't1', round: 1, decision: 'Approved', comment: null },
        { id: 't2', round: 2, decision: 'Rejected', comment: 'Wrong floor.' },
      ]);

      expect(decisions).toEqual([ApprovalDecision.Approved, ApprovalDecision.Rejected]);
    });

    // `null` is a STATE (the approval is undecided), not a parse failure.
    it('preserves a null decision as undecided', () => {
      let decision: ApprovalDecision | null | undefined;
      service
        .bySubject(ApprovalSubjectType.DesignBrief, 'brief-1')
        .subscribe((r) => (decision = r[0].decision));

      http
        .expectOne(url('/approvals/by-subject/2/brief-1'))
        .flush([{ id: 't3', round: 3, decision: null, comment: null }]);

      expect(decision).toBeNull();
    });

    // Defensive: if the backend ever fixes the quirk and starts sending integers, the
    // normalizer must not regress.
    it('also accepts the integer form, so a server-side fix cannot break us', () => {
      let subjectType: ApprovalSubjectType | undefined;
      service.portalPending().subscribe((r) => (subjectType = r[0].subjectType));

      http.expectOne(url('/crm/portal/approvals')).flush([
        {
          id: 'a1',
          subjectType: 3,
          subjectId: 'item-1',
          projectId: 'project-1',
          projectName: 'Villa Kafr El-Sheikh',
          roundNumber: 1,
          createdAtUtc: '2026-07-03T09:00:00Z',
        },
      ]);

      expect(subjectType).toBe(ApprovalSubjectType.RequirementItem);
    });
  });

  // ClientApprovalTrailResponse is a DIFFERENT shape than PendingApprovalResponse —
  // its own project identity, and `roundNumber` rather than `round` on the wire.
  describe('portalPending() — the full row shape', () => {
    it('normalizes a still-pending row', () => {
      let row: import('../model').ClientApprovalTrailRow | undefined;
      service.portalPending().subscribe((r) => (row = r[0]));

      http.expectOne(url('/crm/portal/approvals')).flush([
        {
          id: 'a1',
          subjectType: 'BriefSpace',
          subjectId: 'space-1',
          projectId: 'project-1',
          projectName: 'Villa Kafr El-Sheikh',
          roundNumber: 1,
          createdAtUtc: '2026-07-03T09:00:00Z',
          decision: null,
          decidedAtUtc: null,
          comment: null,
          responseDueAtUtc: '2026-07-10T09:00:00Z',
        },
      ]);

      expect(row).toEqual({
        id: 'a1',
        subjectType: ApprovalSubjectType.BriefSpace,
        subjectId: 'space-1',
        projectId: 'project-1',
        projectName: 'Villa Kafr El-Sheikh',
        round: 1,
        createdAtUtc: '2026-07-03T09:00:00Z',
        decision: null,
        decidedAtUtc: null,
        comment: null,
        responseDueAtUtc: '2026-07-10T09:00:00Z',
        trackKey: 'a1',
      });
    });

    it('normalizes a decided (rejected) row — stays in the trail, never overwritten', () => {
      let row: import('../model').ClientApprovalTrailRow | undefined;
      service.portalPending().subscribe((r) => (row = r[0]));

      http.expectOne(url('/crm/portal/approvals')).flush([
        {
          id: 'a2',
          subjectType: 'RequirementItem',
          subjectId: 'item-1',
          projectId: 'project-1',
          projectName: 'Villa Kafr El-Sheikh',
          roundNumber: 2,
          createdAtUtc: '2026-07-05T09:00:00Z',
          decision: 'Rejected',
          decidedAtUtc: '2026-07-06T09:00:00Z',
          comment: 'Wrong floor.',
          responseDueAtUtc: null,
        },
      ]);

      expect(row?.decision).toBe(ApprovalDecision.Rejected);
      expect(row?.round).toBe(2);
      expect(row?.comment).toBe('Wrong floor.');
    });
  });

  // 009b #41: ApprovalEndpoints.cs:24-31 binds `int pageNumber, int pageSize` (both required,
  // 1-based) and returns PagedResult<PendingApprovalResponse> {items, pageNumber, pageSize,
  // totalCount, totalPages}. skip/take are gone.
  describe('pending() (009b #41)', () => {
    it('sends pageNumber/pageSize and reads the 1-based pageNumber back unshifted', () => {
      let page: number | undefined;
      service.pending(2, 20).subscribe((r) => (page = r.page));

      const req = http.expectOne((r) => r.url === url('/approvals/pending'));
      expect(req.request.params.get('pageNumber')).toBe('2');
      expect(req.request.params.get('pageSize')).toBe('20');
      expect(req.request.params.has('skip')).toBe(false);
      expect(req.request.params.has('take')).toBe(false);

      req.flush({ items: [], pageNumber: 2, pageSize: 20, totalCount: 30, totalPages: 2 });

      expect(page).toBe(2);
    });

    it('reduces a row to the PendingApprovalResponse wire fields plus type and dueAtUtc', () => {
      let rows: import('../model').PendingApproval[] = [];
      service.pending(1, 50).subscribe((r) => (rows = r.items));

      http
        .expectOne((r) => r.url === url('/approvals/pending'))
        .flush({
          items: [
            {
              id: 'a1',
              subjectType: 2,
              subjectId: 'brief-1',
              type: 2,
              round: 3,
              dueAtUtc: '2026-07-10T09:00:00+00:00',
            },
            { id: 'a2', subjectType: 5, subjectId: 'doc-1', type: 1, round: 1, dueAtUtc: null },
          ],
          pageNumber: 1,
          pageSize: 50,
          totalCount: 2,
          totalPages: 1,
        });

      expect(rows).toEqual([
        {
          id: 'a1',
          subjectType: ApprovalSubjectType.DesignBrief,
          subjectId: 'brief-1',
          type: 2,
          round: 3,
          dueAtUtc: '2026-07-10T09:00:00+00:00',
          trackKey: 'a1',
        },
        {
          id: 'a2',
          subjectType: 5,
          subjectId: 'doc-1',
          type: 1,
          round: 1,
          dueAtUtc: null,
          trackKey: 'a2',
        },
      ]);
    });
  });

  // Enforced twice server-side (a FluentValidation rule and the domain entity). The UI
  // must never let the user reach `approvals.CommentRequired`.
  describe('the reject-comment rule', () => {
    it('refuses to submit a rejection with no comment', () => {
      expect(() =>
        service.decide('a1', { decision: ApprovalDecision.Rejected, comment: null }),
      ).toThrow(/comment is required/i);
    });

    it('treats a whitespace-only comment as empty — the spec edge case', () => {
      expect(() =>
        service.decide('a1', { decision: ApprovalDecision.Rejected, comment: '   \t\n  ' }),
      ).toThrow(/comment is required/i);
    });

    it('accepts a rejection with a real comment, trimmed', () => {
      service
        .decide('a1', { decision: ApprovalDecision.Rejected, comment: '  Wrong floor.  ' })
        .subscribe();

      const req = http.expectOne(url('/approvals/a1/decide'));
      expect(req.request.method).toBe('PUT'); // PUT, not POST
      expect(req.request.body).toEqual({
        decision: ApprovalDecision.Rejected,
        comment: 'Wrong floor.',
      });
      req.flush(null);
    });

    it('caps the comment at 2000 characters', () => {
      service
        .decide('a1', { decision: ApprovalDecision.Rejected, comment: 'x'.repeat(3000) })
        .subscribe();

      const req = http.expectOne(url('/approvals/a1/decide'));
      expect((req.request.body as { comment: string }).comment).toHaveLength(2000);
      req.flush(null);
    });

    it('allows an approval with no comment', () => {
      service.decide('a1', { decision: ApprovalDecision.Approved, comment: null }).subscribe();

      const req = http.expectOne(url('/approvals/a1/decide'));
      expect(req.request.body).toEqual({ decision: ApprovalDecision.Approved, comment: null });
      req.flush(null);
    });
  });

  // Dependency 12 — the client decides through the PORTAL route, gated on crm.portal.
  // The Client role does not hold projects.read, so the office route is not reachable.
  it('routes the client decide through /crm/portal/approvals/{id}/decide', () => {
    service
      .decideAsClient('a1', { decision: ApprovalDecision.Approved, comment: null })
      .subscribe();

    const req = http.expectOne(url('/crm/portal/approvals/a1/decide'));
    expect(req.request.method).toBe('PUT');
    req.flush(null);
  });
});

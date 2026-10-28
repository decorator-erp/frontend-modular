import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { ApprovalDecision, ApprovalSubjectType } from '../model/crm-enums';
import { environment } from '../../../../environments/environment';
import { ERROR_MESSAGES, ERROR_MESSAGES_AR } from '@platform/errors/error-catalog';
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

  // `PendingApprovalResponse.SubjectType` may arrive hand-serialized as its STRING name.
  // No string enum may reach a store, so it is mapped at this boundary.
  describe('the hand-serialized string enum', () => {
    const page = (subjectType: unknown) => ({
      items: [{ id: 'a1', subjectType, subjectId: 's1', type: 2, round: 1, dueAtUtc: null }],
      pageNumber: 1,
      pageSize: 20,
      totalCount: 1,
      totalPages: 1,
    });

    it('maps PendingApprovalResponse.SubjectType from its STRING name to the enum', () => {
      let subjectType: ApprovalSubjectType | undefined;
      service.pending().subscribe((r) => (subjectType = r.items[0].subjectType));

      http.expectOne((r) => r.url === url('/approvals/pending')).flush(page('DesignBrief'));

      expect(subjectType).toBe(ApprovalSubjectType.DesignBrief);
      expect(typeof subjectType).toBe('number');
    });

    // Defensive: if the backend ever fixes the quirk and starts sending integers, the
    // normalizer must not regress.
    it('also accepts the integer form, so a server-side fix cannot break us', () => {
      let subjectType: ApprovalSubjectType | undefined;
      service.pending().subscribe((r) => (subjectType = r.items[0].subjectType));

      http.expectOne((r) => r.url === url('/approvals/pending')).flush(page(3));

      expect(subjectType).toBe(ApprovalSubjectType.RequirementItem);
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

  // 009b #42: Approvals.Contracts/Enums.cs:8-15,47-52 adds ProjectDocument = 5 and
  // ChangesRequested = 3; ApprovalContracts.cs:24-28 requires a comment for Rejected AND
  // ChangesRequested.
  describe('ChangesRequested and ProjectDocument (009b #42)', () => {
    it('refuses ChangesRequested with a whitespace-only comment', () => {
      expect(() =>
        service.decide('a1', { decision: ApprovalDecision.ChangesRequested, comment: ' ' }),
      ).toThrow(/comment is required/i);
    });

    it('sends ChangesRequested (3) with its trimmed comment', () => {
      service
        .decide('a1', { decision: ApprovalDecision.ChangesRequested, comment: ' Move the door. ' })
        .subscribe();

      const req = http.expectOne(url('/approvals/a1/decide'));
      expect(req.request.body).toEqual({ decision: 3, comment: 'Move the door.' });
      req.flush(null);
    });

    it('maps the subject name ProjectDocument to 5', () => {
      let subjectType: ApprovalSubjectType | undefined;
      service.pending().subscribe((r) => (subjectType = r.items[0].subjectType));

      http
        .expectOne((r) => r.url === url('/approvals/pending'))
        .flush({
          items: [{ id: 'a1', subjectType: 'ProjectDocument', subjectId: 'd1', type: 1, round: 1 }],
          pageNumber: 1,
          pageSize: 20,
          totalCount: 1,
          totalPages: 1,
        });

      expect(subjectType).toBe(ApprovalSubjectType.ProjectDocument);
    });

    it('carries the approvals codes the backend has, in EN and AR, and not DecisionFailed', () => {
      for (const code of [
        'approvals.CommentRequired',
        'approvals.ApprovalIdInUse',
        'approvals.Unauthenticated',
      ]) {
        expect(ERROR_MESSAGES[code]).toBeTruthy();
        expect(ERROR_MESSAGES_AR[code]).toBeTruthy();
      }
      expect(ERROR_MESSAGES['approvals.CommentRequired']).toMatch(/request changes/);
      expect(ERROR_MESSAGES['approvals.DecisionFailed']).toBeUndefined();
    });
  });

  // 009b #N-2: GET /crm/portal/approvals and PUT /crm/portal/approvals/{id}/decide have no
  // backend route (EP/CrmPortalEndpoints.cs:36-153), so nothing callable targets them.
  it('has no portal inbox or portal decide method (009b #N-2)', () => {
    const methods = service as unknown as Record<string, unknown>;
    expect(methods['portalPending']).toBeUndefined();
    expect(methods['decideAsClient']).toBeUndefined();
  });
});

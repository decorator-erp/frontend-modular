import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { ApprovalSubjectType } from '../model/crm-enums';
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

  // 009b #42: Approvals.Contracts/Enums.cs:8-15,47-52 adds ProjectDocument = 5 and
  // ChangesRequested = 3; ApprovalContracts.cs:24-28 requires a comment for Rejected AND
  // ChangesRequested.
  describe('ChangesRequested and ProjectDocument (009b #42)', () => {
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

  // crm-prod B1-fe: no office flow decided through this service; the client decides in the
  // portal (`CrmPortalApprovalsService`), so the dead office decide is gone.
  it('has no office decide and no portal methods (crm-prod B1-fe)', () => {
    const methods = service as unknown as Record<string, unknown>;
    expect(methods['decide']).toBeUndefined();
    expect(methods['portalPending']).toBeUndefined();
    expect(methods['decideAsClient']).toBeUndefined();
  });
});

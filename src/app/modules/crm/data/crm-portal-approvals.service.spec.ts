import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { HANDLED_ERROR_STATUSES } from '@platform/http/handled-errors';
import type { PagedResult } from '@platform/types';
import { environment } from '../../../../environments/environment';
import { ApprovalDecision, ApprovalSubjectType } from '../model/crm-enums';
import type { PortalApproval } from '../model';
import { CrmPortalApprovalsService } from './crm-portal-approvals.service';

// crm-prod B1-fe: `CrmPortalEndpoints.cs:69-87`, `PortalContracts.cs:78-117`.
describe('CrmPortalApprovalsService (crm-prod B1-fe)', () => {
  let service: CrmPortalApprovalsService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(CrmPortalApprovalsService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  const base = `${environment.apiUrl}/crm/portal/approvals`;

  it('GETs /crm/portal/approvals with status, pageNumber and pageSize, 403 handled', () => {
    service.list('pending', 2, 20).subscribe();
    const req = http.expectOne((r) => r.url === base);
    expect(req.request.method).toBe('GET');
    expect(req.request.params.get('status')).toBe('pending');
    expect(req.request.params.get('pageNumber')).toBe('2');
    expect(req.request.params.get('pageSize')).toBe('20');
    expect(req.request.params.keys().sort()).toEqual(['pageNumber', 'pageSize', 'status']);
    expect(req.request.context.get(HANDLED_ERROR_STATUSES)).toEqual([403]);
    req.flush({ items: [], pageNumber: 2, pageSize: 20, totalCount: 0, totalPages: 0 });
  });

  it('sends status=decided for the trail', () => {
    service.list('decided').subscribe();
    const req = http.expectOne((r) => r.url === base);
    expect(req.request.params.get('status')).toBe('decided');
    expect(req.request.params.get('pageNumber')).toBe('1');
    req.flush({ items: [], pageNumber: 1, pageSize: 20, totalCount: 0, totalPages: 0 });
  });

  it('reads PagedResult<PortalApprovalResponse> into the portal row, 1-based', () => {
    let page: PagedResult<PortalApproval> | undefined;
    service.list('decided').subscribe((p) => (page = p));
    http
      .expectOne((r) => r.url === base)
      .flush({
        items: [
          {
            id: 'a1',
            subjectType: 2,
            subjectId: 'b1',
            projectId: 'p1',
            projectName: 'Villa',
            briefId: 'b1',
            stageId: 's1',
            stageName: 'Gathering',
            round: 2,
            title: null,
            requestedAtUtc: '2026-10-01T10:00:00Z',
            dueAtUtc: null,
            decision: 3,
            decidedAtUtc: '2026-10-02T10:00:00Z',
            comment: 'Move the door.',
          },
        ],
        pageNumber: 1,
        pageSize: 20,
        totalCount: 1,
        totalPages: 1,
      });

    expect(page).toEqual({
      items: [
        {
          id: 'a1',
          subjectType: ApprovalSubjectType.DesignBrief,
          subjectId: 'b1',
          projectId: 'p1',
          projectName: 'Villa',
          briefId: 'b1',
          stageId: 's1',
          stageName: 'Gathering',
          round: 2,
          title: null,
          requestedAtUtc: '2026-10-01T10:00:00Z',
          dueAtUtc: null,
          decision: ApprovalDecision.ChangesRequested,
          decidedAtUtc: '2026-10-02T10:00:00Z',
          comment: 'Move the door.',
          trackKey: 'a1',
        },
      ],
      totalCount: 1,
      page: 1,
      pageSize: 20,
      totalPages: 1,
    });
  });

  it('PUTs /crm/portal/approvals/{id}/decide with the decision int and a null comment to approve', () => {
    service.decide('a1', ApprovalDecision.Approved, '   ').subscribe();
    const req = http.expectOne(`${base}/a1/decide`);
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({ decision: 1, comment: null });
    expect(req.request.context.get(HANDLED_ERROR_STATUSES)).toEqual([403]);
    req.flush(null, { status: 204, statusText: 'No Content' });
  });

  it('sends ChangesRequested as 3 with the trimmed comment', () => {
    service.decide('a1', ApprovalDecision.ChangesRequested, '  Move the door.  ').subscribe();
    const req = http.expectOne(`${base}/a1/decide`);
    expect(req.request.body).toEqual({ decision: 3, comment: 'Move the door.' });
    req.flush(null, { status: 204, statusText: 'No Content' });
  });
});

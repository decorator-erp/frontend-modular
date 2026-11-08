import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ApprovalService, PendingApprovalResponse } from './approval.service';

describe('ApprovalService', () => {
  let svc: ApprovalService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [ApprovalService, provideHttpClient(), provideHttpClientTesting()],
    });
    svc = TestBed.inject(ApprovalService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  // Sync W1-6: pageNumber/pageSize are required (ApprovalEndpoints.cs:24-31); the answer is a PagedResult.
  it('GETs /approvals/pending?pageNumber=1&pageSize=200 and reads the paged items', () => {
    let result: PendingApprovalResponse[] | undefined;
    svc.listPending().subscribe((r) => (result = r));
    const req = http.expectOne((r) => r.url === '/api/approvals/pending');
    expect(req.request.method).toBe('GET');
    expect(req.request.params.get('pageNumber')).toBe('1');
    expect(req.request.params.get('pageSize')).toBe('200');
    req.flush({
      items: [
        { id: 'a1', subjectType: 2, subjectId: 's1', type: 1, round: 1, projectId: 'p1' },
        { id: 'a2', subjectType: 'RequirementItem', subjectId: 's2', projectId: null },
      ],
      pageNumber: 1,
      pageSize: 200,
      totalCount: 2,
    });
    expect(result).toEqual([
      { id: 'a1', projectId: 'p1', subjectId: 's1', subjectType: 'DesignBrief' },
      { id: 'a2', projectId: '', subjectId: 's2', subjectType: 'RequirementItem' },
    ]);
  });

  // crm-prod FINDING-P2-10: `GET /api/projects/approval-requests` has no backend route; the
  // method that read it is deleted rather than left callable.
  it('offers no read of the unmapped /projects/approval-requests', () => {
    expect('getProjectApprovalRequests' in svc).toBe(false);
  });
});

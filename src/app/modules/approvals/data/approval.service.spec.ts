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

  it('GETs /approvals/pending and returns the list', () => {
    let result: PendingApprovalResponse[] | undefined;
    svc.listPending().subscribe((r) => (result = r));
    const req = http.expectOne('/api/approvals/pending');
    expect(req.request.method).toBe('GET');
    req.flush([{ id: 'a1', projectId: 'p1' }]);
    expect(result).toEqual([{ id: 'a1', projectId: 'p1' }]);
  });

  // crm-prod FINDING-P2-10: `GET /api/projects/approval-requests` has no backend route; the
  // method that read it is deleted rather than left callable.
  it('offers no read of the unmapped /projects/approval-requests', () => {
    expect('getProjectApprovalRequests' in svc).toBe(false);
  });
});

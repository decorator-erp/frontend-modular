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

  // crm-prod F-approvals-route: `GET /api/projects/approval-requests` has no backend route, so
  // no screen may call it (the project page's "Open actions" KPI is hidden, crm-prod B2-fe).
  it('has no caller of the unmapped /projects/approval-requests outside this service', async () => {
    const fsName = 'node:fs';
    const fs = (await import(/* @vite-ignore */ fsName)) as {
      readdirSync(path: string, options: { recursive: true }): string[];
      readFileSync(path: string, encoding: 'utf8'): string;
    };
    const root = `${(globalThis as unknown as { process: { cwd(): string } }).process.cwd()}/src/app`;
    const callers = fs
      .readdirSync(root, { recursive: true })
      .filter((f) => f.endsWith('.ts') && !f.endsWith('.spec.ts'))
      .filter((f) => !f.endsWith('modules/approvals/data/approval.service.ts'))
      .filter((f) =>
        fs.readFileSync(`${root}/${f}`, 'utf8').includes('getProjectApprovalRequests('),
      );
    expect(callers).toEqual([]);
  });
});

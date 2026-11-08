import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { environment } from '../../../../environments/environment';
import { AuditService } from './audit.service';
import type { AuditPagedResult } from '../model/audit.model';

/** Sync W1-9 / W2-7: 1-based pageNumber in and out (PagedResult.cs), AuditAction int → name. */
describe('AuditService (sync W1-9)', () => {
  let service: AuditService;
  let http: HttpTestingController;
  const url = `${environment.apiUrl}/audit`;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(AuditService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('sends pageNumber (not page/desc) and reads pageNumber and the action name', () => {
    let res: AuditPagedResult | undefined;
    service
      .getLogs({ page: 3, pageSize: 30, desc: true, entityName: 'Project' })
      .subscribe((r) => (res = r));
    const req = http.expectOne((r) => r.url === url);
    expect(req.request.params.get('pageNumber')).toBe('3');
    expect(req.request.params.get('pageSize')).toBe('30');
    expect(req.request.params.get('entityName')).toBe('Project');
    expect(req.request.params.has('page')).toBe(false);
    expect(req.request.params.has('desc')).toBe(false);
    req.flush({
      items: [{ id: 'L1', action: 2, entityName: 'Project', timestamp: '2026-11-07T10:00:00Z' }],
      pageNumber: 3,
      pageSize: 30,
      totalCount: 61,
      totalPages: 3,
    });
    expect(res?.page).toBe(3);
    expect(res?.totalCount).toBe(61);
    expect(res?.items[0].action).toBe('Update');
  });
});

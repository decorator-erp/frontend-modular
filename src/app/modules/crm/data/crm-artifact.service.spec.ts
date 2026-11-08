import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { environment } from '../../../../environments/environment';
import { HANDLED_ERROR_STATUSES } from '@platform/http/handled-errors';
import type { CrmArtifactLink, CrmArtifactSubject } from '../model';
import { CrmArtifactService } from './crm-artifact.service';

// crmp C-7: contract §2.12, CrmArtifactEndpoints.cs:58 (unlink), :65/:79/:93/:108 (lists).
describe('CrmArtifactService (crmp C-7)', () => {
  let service: CrmArtifactService;
  let http: HttpTestingController;
  const url = (path: string) => `${environment.apiUrl}${path}`;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [CrmArtifactService, provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(CrmArtifactService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  const subjects: CrmArtifactSubject[] = ['brief', 'space', 'requirement-item', 'meeting'];
  for (const subject of subjects) {
    it(`GET /crm/artifacts/by-${subject}/{id}?pageNumber&pageSize → a plain array`, () => {
      let rows: CrmArtifactLink[] = [];
      service.listBySubject(subject, 'X', 2, 20).subscribe((r) => (rows = r));
      const req = http.expectOne((r) => r.url === url(`/crm/artifacts/by-${subject}/X`));
      expect(req.request.method).toBe('GET');
      expect(req.request.params.get('pageNumber')).toBe('2');
      expect(req.request.params.get('pageSize')).toBe('20');
      expect(req.request.context.get(HANDLED_ERROR_STATUSES)).toEqual([403, 404]);
      req.flush([
        {
          id: 'L1',
          documentId: 'D1',
          briefId: 'X',
          spaceId: null,
          requirementItemId: null,
          meetingId: null,
          addedByEmployeeId: 'E1',
          addedByContactId: null,
        },
      ]);
      expect(rows).toEqual([
        {
          id: 'L1',
          documentId: 'D1',
          briefId: 'X',
          spaceId: null,
          requirementItemId: null,
          meetingId: null,
          addedByEmployeeId: 'E1',
          addedByContactId: null,
        },
      ]);
    });
  }

  it('DELETE /crm/artifacts/{linkId} — 403/404 handled by the caller', () => {
    service.unlink('L1').subscribe();
    const req = http.expectOne(url('/crm/artifacts/L1'));
    expect(req.request.method).toBe('DELETE');
    expect(req.request.context.get(HANDLED_ERROR_STATUSES)).toEqual([403, 404]);
    req.flush(null, { status: 204, statusText: 'No Content' });
  });
});

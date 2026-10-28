import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { HANDLED_ERROR_STATUSES } from '@platform/http/handled-errors';
import { environment } from '../../../../environments/environment';
import { CrmClientPortalService } from './crm-portal.service';

describe('CrmClientPortalService', () => {
  let service: CrmClientPortalService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(CrmClientPortalService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  describe('getMyProfile (009b #N-1)', () => {
    it('marks the 404 of the unshipped Dependency 13 route as handled', () => {
      let failed = false;
      service.getMyProfile().subscribe({ error: () => (failed = true) });
      const req = http.expectOne(`${environment.apiUrl}/crm/portal/profile`);
      expect(req.request.method).toBe('GET');
      expect(req.request.context.get(HANDLED_ERROR_STATUSES)).toEqual([404]);
      req.flush(null, { status: 404, statusText: 'Not Found' });
      expect(failed).toBe(true);
    });
  });
});

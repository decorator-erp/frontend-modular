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

  describe('getMyProfile (crmp C-2, CrmPortalEndpoints.cs:53)', () => {
    it('reads PortalProfileResponse: identity, contacts, projects (status is a name)', () => {
      let result: unknown;
      service.getMyProfile().subscribe((p) => (result = p));
      const req = http.expectOne(`${environment.apiUrl}/crm/portal/profile`);
      expect(req.request.method).toBe('GET');
      req.flush({
        client: {
          id: 'c1',
          name: 'Ahmed Mansour',
          firstName: 'Ahmed',
          lastName: 'Mansour',
          email: 'a@x.com',
          phoneNumber: '010',
          address: 'Cairo',
        },
        contacts: [
          {
            id: 'k1',
            firstName: 'Ahmed',
            lastName: 'Mansour',
            email: null,
            phone: '010',
            mobile: null,
            role: 1,
            isPrimary: true,
          },
        ],
        projects: [
          {
            id: 'p1',
            code: 'PRJ-1',
            name: 'Villa',
            status: 'InProgress',
            progressPercentage: 42.5,
            activeStageId: 's1',
            activeStageName: 'Design',
            openPeriodId: null,
          },
        ],
      });
      expect(result).toEqual({
        client: {
          id: 'c1',
          name: 'Ahmed Mansour',
          firstName: 'Ahmed',
          lastName: 'Mansour',
          email: 'a@x.com',
          phoneNumber: '010',
          address: 'Cairo',
        },
        contacts: [
          {
            id: 'k1',
            firstName: 'Ahmed',
            lastName: 'Mansour',
            email: null,
            phone: '010',
            mobile: null,
            role: 1,
            isPrimary: true,
          },
        ],
        projects: [
          {
            id: 'p1',
            code: 'PRJ-1',
            name: 'Villa',
            status: 'InProgress',
            progressPercentage: 42.5,
            activeStageId: 's1',
            activeStageName: 'Design',
            openPeriodId: null,
          },
        ],
      });
    });

    it('marks the 403 (NotAClient) and 404 (no linked client) as handled', () => {
      let failed = false;
      service.getMyProfile().subscribe({ error: () => (failed = true) });
      const req = http.expectOne(`${environment.apiUrl}/crm/portal/profile`);
      expect(req.request.method).toBe('GET');
      expect(req.request.context.get(HANDLED_ERROR_STATUSES)).toEqual([403, 404]);
      req.flush(null, { status: 404, statusText: 'Not Found' });
      expect(failed).toBe(true);
    });
  });
});

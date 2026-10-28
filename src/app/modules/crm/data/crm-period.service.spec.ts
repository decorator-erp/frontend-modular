import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { environment } from '../../../../environments/environment';
import { RequirementPeriodStatus } from '../model/crm-enums';
import { CrmPeriodService } from './crm-period.service';

describe('CrmPeriodService', () => {
  let service: CrmPeriodService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [CrmPeriodService, provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(CrmPeriodService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  const url = (path: string) => `${environment.apiUrl}${path}`;

  describe('open (009b #26)', () => {
    it('emits the id read off the one-property 201 body', () => {
      let id: string | undefined;
      service.open('P', '2026-07-20T18:00:00Z', 'S').subscribe((v) => (id = v));

      const req = http.expectOne({ method: 'POST', url: url('/crm/projects/P/periods') });
      expect(req.request.body).toEqual({
        projectStageId: 'S',
        closesAtUtc: '2026-07-20T18:00:00Z',
      });
      req.flush({ periodId: 'Per' }, { status: 201, statusText: 'Created' });

      expect(id).toBe('Per');
    });
  });

  describe('list (009b #25)', () => {
    it('normalizes CrmRequirementPeriodResponse, which has no closeNotifiedAtUtc or createdAtUtc', () => {
      let periods: unknown[] = [];
      service.list('P').subscribe((p) => (periods = p));

      http.expectOne({ method: 'GET', url: url('/crm/projects/P/periods') }).flush([
        {
          id: 'Per',
          projectId: 'P',
          projectStageId: 'S',
          status: RequirementPeriodStatus.Closed,
          closesAtUtc: '2026-07-20T18:00:00Z',
          closedAtUtc: '2026-07-19T10:00:00Z',
          openedById: 'E',
        },
      ]);

      expect(periods).toEqual([
        {
          id: 'Per',
          projectId: 'P',
          projectStageId: 'S',
          status: RequirementPeriodStatus.Closed,
          closesAtUtc: '2026-07-20T18:00:00Z',
          closedAtUtc: '2026-07-19T10:00:00Z',
          openedById: 'E',
        },
      ]);
    });
  });
});

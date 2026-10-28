import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Observable } from 'rxjs';
import { HANDLED_ERROR_STATUSES } from '@platform/http/handled-errors';
import { environment } from '../../../../environments/environment';
import { RequirementCategory, RequirementPriority } from '../model/crm-enums';
import { CrmBriefService } from './crm-brief.service';
import { CrmItemService } from './crm-item.service';
import { CrmMeetingService } from './crm-meeting.service';
import { CrmPeriodService } from './crm-period.service';

/**
 * FINDING-5-7 (X-6): these writes and portal reads can answer 403 (`crm.access.NoStanding`,
 * `crm.portal.NotAClient`, …). Each caller shows the code's `friendly()` message, so the request
 * marks 403 handled and the interceptor's generic toast stays out of the way.
 */
describe('CRM requests that mark 403 handled (FINDING-5-7)', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  const url = (path: string) => `${environment.apiUrl}${path}`;
  const item = {
    category: RequirementCategory.SpaceLayout,
    title: 'T',
    priority: RequirementPriority.Medium,
  };

  const cases: [string, string, string, () => Observable<unknown>][] = [
    [
      'CrmItemService.create',
      'POST',
      '/crm/periods/Per/items',
      () => TestBed.inject(CrmItemService).create('Per', { projectId: 'P', ...item }),
    ],
    [
      'CrmItemService.supersede',
      'POST',
      '/crm/requirement-items/I/supersede',
      () => TestBed.inject(CrmItemService).supersede('I', item),
    ],
    [
      'CrmItemService.portalCreate',
      'POST',
      '/crm/portal/requirement-items',
      () =>
        TestBed.inject(CrmItemService).portalCreate({ projectId: 'P', periodId: 'Per', ...item }),
    ],
    [
      'CrmBriefService.addSpace',
      'POST',
      '/crm/briefs/B/spaces',
      () => TestBed.inject(CrmBriefService).addSpace('B', { requirements: 'x' }),
    ],
    [
      'CrmBriefService.supersedeSpace',
      'POST',
      '/crm/brief-spaces/S/supersede',
      () => TestBed.inject(CrmBriefService).supersedeSpace('S', { requirements: 'x' }),
    ],
    [
      'CrmPeriodService.open',
      'POST',
      '/crm/projects/P/periods',
      () => TestBed.inject(CrmPeriodService).open('P', '2026-07-20T18:00:00Z'),
    ],
    [
      'CrmMeetingService.portalReschedule',
      'PUT',
      '/crm/portal/meetings/M/reschedule',
      () =>
        TestBed.inject(CrmMeetingService).portalReschedule('M', {
          startsAtUtc: '2099-01-01T08:00:00Z',
          endsAtUtc: '2099-01-01T09:00:00Z',
        }),
    ],
    [
      'CrmMeetingService.portalCancel',
      'PUT',
      '/crm/portal/meetings/M/cancel',
      () => TestBed.inject(CrmMeetingService).portalCancel('M', 'busy'),
    ],
    [
      'CrmMeetingService.portalList',
      'GET',
      '/crm/portal/meetings',
      () => TestBed.inject(CrmMeetingService).portalList(),
    ],
    [
      'CrmMeetingService.portalGetById',
      'GET',
      '/crm/portal/meetings/M',
      () => TestBed.inject(CrmMeetingService).portalGetById('M'),
    ],
  ];

  it.each(cases)('%s marks 403 handled', (_name, method, path, call) => {
    call().subscribe({ error: () => undefined });
    const req = http.expectOne((r) => r.method === method && r.url === url(path));
    expect(req.request.context.get(HANDLED_ERROR_STATUSES)).toEqual([403]);
    req.flush(null);
  });
});

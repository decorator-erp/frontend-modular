import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { HANDLED_ERROR_STATUSES } from '@platform/http/handled-errors';
import { environment } from '../../../../environments/environment';
import {
  CrmMyGatheringWorkService,
  type MyGatheringWorkItem,
} from './crm-my-gathering-work.service';

// crmp C-3: CrmMyWorkEndpoints.cs:19; MyGatheringWorkItemResponse (MyWorkContracts.cs).
describe('CrmMyGatheringWorkService (crmp C-3)', () => {
  let service: CrmMyGatheringWorkService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(CrmMyGatheringWorkService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('GETs /crm/my-gathering-work with the 403 handled and reads every field', () => {
    let rows: MyGatheringWorkItem[] = [];
    service.list().subscribe((r) => (rows = r));
    const req = http.expectOne(`${environment.apiUrl}/crm/my-gathering-work`);
    expect(req.request.method).toBe('GET');
    expect(req.request.context.get(HANDLED_ERROR_STATUSES)).toEqual([403]);
    req.flush([
      {
        projectTaskId: 't1',
        taskName: 'Gather',
        projectId: 'p1',
        projectName: 'Villa',
        projectStageId: null,
        stageName: null,
        taskBlock: {
          briefId: 'b1',
          briefStatus: 1,
          entryTotal: 4,
          entryPending: 2,
          itemTotal: 3,
          itemPending: 1,
          unresolvedTotal: 3,
          meetingsUpcoming: 1,
        },
        openPeriodClosesAtUtc: '2030-01-01T00:00:00Z',
        nextMeetingAtUtc: null,
      },
    ]);
    expect(rows[0]).toMatchObject({
      projectTaskId: 't1',
      projectId: 'p1',
      openPeriodClosesAtUtc: '2030-01-01T00:00:00Z',
      taskBlock: { briefStatus: 1, entryPending: 2, itemPending: 1, meetingsUpcoming: 1 },
    });
  });
});

import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ProjectService } from '@modules/projects';
import { ModalService } from '@ds';
import { CrmItemService } from '../../data/crm-item.service';
import { CrmMeetingService } from '../../data/crm-meeting.service';
import { CrmPeriodService } from '../../data/crm-period.service';
import { RequirementPeriodStatus } from '../../model/crm-enums';
import { CrmDashboardComponent } from './crm-dashboard.component';
import type { CrmActivityEntry } from './activity-list.component';

const periods = [
  {
    id: 'Old',
    projectId: 'P',
    projectStageId: null,
    status: RequirementPeriodStatus.Closed,
    closesAtUtc: '2026-06-10T18:00:00Z',
    closedAtUtc: '2026-06-09T10:00:00Z',
    openedById: 'E',
  },
  {
    id: 'Cur',
    projectId: 'P',
    projectStageId: null,
    status: RequirementPeriodStatus.Open,
    closesAtUtc: '2026-07-20T18:00:00Z',
    closedAtUtc: null,
    openedById: 'E',
  },
];

describe('CrmDashboardComponent', () => {
  let projectsApi: { getById: ReturnType<typeof vi.fn> };
  let itemsApi: Record<string, ReturnType<typeof vi.fn>>;

  beforeEach(() => {
    projectsApi = {
      getById: vi
        .fn()
        .mockReturnValue(
          of({
            id: 'P',
            code: 'PRJ-1',
            name: 'Villa',
            clientId: 'C',
            clientName: '',
            productOwnerName: '',
          }),
        ),
    };
    itemsApi = {
      search: vi.fn().mockReturnValue(of([])),
    };
    TestBed.configureTestingModule({
      imports: [CrmDashboardComponent],
      providers: [
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: new Map([['projectId', 'P']]) } },
        },
        { provide: ProjectService, useValue: projectsApi },
        { provide: CrmItemService, useValue: itemsApi },
        { provide: CrmPeriodService, useValue: { list: vi.fn().mockReturnValue(of(periods)) } },
        { provide: CrmMeetingService, useValue: { search: vi.fn().mockReturnValue(of([])) } },
        { provide: ModalService, useValue: { open: vi.fn() } },
      ],
    });
  });

  function create() {
    const fixture = TestBed.createComponent(CrmDashboardComponent);
    fixture.detectChanges();
    return fixture;
  }

  describe('activity (009b #25)', () => {
    it('stamps the period-opened entry with closesAtUtc (no createdAtUtc) and orders by it', () => {
      const c = create().componentInstance;
      const activity = (c['activity'] as () => CrmActivityEntry[])();

      expect(activity.map((e) => [e.id, e.timestampUtc])).toEqual([
        ['Cur-opened', '2026-07-20T18:00:00Z'],
        ['Old-opened', '2026-06-10T18:00:00Z'],
        ['Old-closed', '2026-06-09T10:00:00Z'],
      ]);
    });
  });
});

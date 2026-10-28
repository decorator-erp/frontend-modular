import { TestBed } from '@angular/core/testing';
import { ActivatedRoute } from '@angular/router';
import { of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { ModalService } from '@ds';
import { PermissionsService } from '@platform/permissions';
import { CrmItemService } from '../../data/crm-item.service';
import { CrmPeriodService } from '../../data/crm-period.service';
import { ApprovalState, RequirementPeriodStatus } from '../../model/crm-enums';
import { ItemsStore } from '../../stores/items.store';
import { PeriodStore } from '../../stores/period.store';
import { CrmItemsBoardComponent } from './items-board.component';

const item = (id: string, periodId: string, approvalStatus: ApprovalState) => ({
  id,
  projectId: 'P',
  periodId,
  category: 1,
  spaceTypeId: null,
  room: null,
  title: id,
  details: null,
  priority: 2,
  sourceType: null,
  meetingId: null,
  briefId: null,
  noteId: null,
  approvalStatus,
  supersedesItemId: null,
  createdByEmployeeId: 'E',
  createdByContactId: null,
  projectTaskId: null,
});

describe('CrmItemsBoardComponent (009b #24)', () => {
  it('disables Send, Edit and Supersede for items whose period is Closed', () => {
    TestBed.configureTestingModule({
      imports: [CrmItemsBoardComponent],
      providers: [
        ItemsStore,
        PeriodStore,
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: new Map([['projectId', 'P']]) } },
        },
        { provide: ModalService, useValue: { open: vi.fn() } },
        { provide: PermissionsService, useValue: { can: () => true } },
        {
          provide: CrmItemService,
          useValue: {
            listByProject: vi
              .fn()
              .mockReturnValue(
                of([
                  item('Shut-draft', 'Old', ApprovalState.Draft),
                  item('Shut-locked', 'Old', ApprovalState.Approved),
                  item('Live-draft', 'Cur', ApprovalState.Draft),
                ]),
              ),
          },
        },
        {
          provide: CrmPeriodService,
          useValue: {
            list: vi.fn().mockReturnValue(
              of([
                {
                  id: 'Cur',
                  status: RequirementPeriodStatus.Open,
                  closesAtUtc: '2099-01-01T00:00:00Z',
                },
                {
                  id: 'Old',
                  status: RequirementPeriodStatus.Closed,
                  closesAtUtc: '2026-01-01T00:00:00Z',
                },
              ]),
            ),
          },
        },
      ],
    });
    const fixture = TestBed.createComponent(CrmItemsBoardComponent);
    fixture.detectChanges();
    const rows = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('li'));
    const buttonsOf = (title: string) => {
      const row = rows.find((li) => li.textContent?.includes(title));
      return Array.from(row?.querySelectorAll('button') ?? []);
    };

    const shutDraft = buttonsOf('Shut-draft');
    const shutLocked = buttonsOf('Shut-locked');
    const liveDraft = buttonsOf('Live-draft');
    expect(shutDraft.length).toBe(2); // Edit + Send
    expect(shutDraft.every((b) => b.disabled)).toBe(true);
    expect(shutLocked.length).toBe(1); // New version
    expect(shutLocked[0].disabled).toBe(true);
    expect(liveDraft.length).toBe(2);
    expect(liveDraft.some((b) => b.disabled)).toBe(false);
  });
});

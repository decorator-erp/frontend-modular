import { HttpErrorResponse } from '@angular/common/http';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CrmBriefService } from '../../data/crm-brief.service';
import { CrmItemService } from '../../data/crm-item.service';
import { ApprovalSubjectType } from '../../model/crm-enums';
import type { BriefHeadDiff, ClientApprovalTrailRow } from '../../model';
import { ApprovalsInboxStore } from '../../stores/approvals-inbox.store';
import { CrmApprovalsInboxComponent } from './approvals-inbox.component';

const ROW: ClientApprovalTrailRow = {
  id: 'A1',
  subjectType: ApprovalSubjectType.DesignBrief,
  subjectId: 'B',
  projectId: 'P',
  projectName: 'Villa',
  round: 1,
  createdAtUtc: '2026-07-01T00:00:00Z',
  decision: null,
  decidedAtUtc: null,
  comment: null,
  responseDueAtUtc: null,
  trackKey: 'k1',
};

describe('CrmApprovalsInboxComponent — brief head diff (009b #16)', () => {
  let getHeadDiff: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    getHeadDiff = vi.fn();
    TestBed.configureTestingModule({
      imports: [CrmApprovalsInboxComponent],
      providers: [
        { provide: CrmBriefService, useValue: { getHeadDiff } },
        { provide: CrmItemService, useValue: {} },
      ],
    });
    TestBed.overrideComponent(CrmApprovalsInboxComponent, {
      add: {
        providers: [
          {
            provide: ApprovalsInboxStore,
            useValue: {
              load: vi.fn(),
              decide: vi.fn(),
              loading: signal(false),
              error: signal(null),
              pending: signal([ROW]),
              decided: signal([]),
              rows: signal([ROW]),
              decidingId: signal(null),
            },
          },
        ],
      },
    });
  });

  function open(): HTMLElement {
    const fixture = TestBed.createComponent(CrmApprovalsInboxComponent);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    (el.querySelector('li button') as HTMLButtonElement).click();
    fixture.detectChanges();
    return el;
  }

  it('renders round 1 as the initial values, not as changes', () => {
    const diff: BriefHeadDiff = {
      briefId: 'B',
      round: 1,
      previousRound: null,
      changes: [
        { field: 'UnitType', previousValue: null, currentValue: '2' },
        { field: 'Sector', previousValue: null, currentValue: '1' },
      ],
    };
    getHeadDiff.mockReturnValue(of(diff));

    const text = open().textContent ?? '';

    expect(getHeadDiff).toHaveBeenCalledWith('B', 1);
    expect(text).toContain('Initial values (round 1):');
    expect(text).toContain('Villa');
    expect(text).toContain('Residential');
    expect(text).not.toContain('→');
  });

  it('shows the catalog message for 404 crm.briefs.RoundNotFound', () => {
    getHeadDiff.mockReturnValue(
      throwError(
        () =>
          new HttpErrorResponse({
            status: 404,
            error: { errors: { 'crm.briefs.RoundNotFound': ['No such round.'] } },
          }),
      ),
    );

    expect(open().textContent).toContain('The brief has no such round.');
  });
});

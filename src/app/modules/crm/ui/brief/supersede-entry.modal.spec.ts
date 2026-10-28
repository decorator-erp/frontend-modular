import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { ToastService } from '@platform/feedback/toast.service';
import { friendlyMessage } from '@platform/errors/error-catalog';
import { PERA_MODAL_DATA, PeraModalRef } from '@ds';
import { CrmBriefService } from '../../data/crm-brief.service';
import { ApprovalState } from '../../model/crm-enums';
import type { BriefSpace } from '../../model';
import { CrmSupersedeEntryModalComponent } from './supersede-entry.modal';

describe('CrmSupersedeEntryModalComponent (009b #15)', () => {
  it("repeats the original entry's wire spaceId, whatever its resolved space ref", () => {
    const entry: BriefSpace = {
      id: 'E1',
      briefId: 'B',
      spaceId: 'SP1',
      // Unresolved for display — the correction must still name the original's space.
      space: null,
      countOrPieces: 2,
      requirements: 'old',
      meetingId: null,
      approvalStatus: ApprovalState.Approved,
      supersedesSpaceId: null,
      projectTaskId: null,
      createdById: 'emp',
      isCurrent: true,
    };
    const supersedeSpace = vi.fn(() => of('E2'));
    TestBed.configureTestingModule({
      imports: [CrmSupersedeEntryModalComponent],
      providers: [
        { provide: CrmBriefService, useValue: { supersedeSpace } },
        { provide: ToastService, useValue: { show: vi.fn() } },
        { provide: PeraModalRef, useValue: { close: vi.fn() } },
        { provide: PERA_MODAL_DATA, useValue: { projectId: 'P', entry } },
      ],
    });
    const c = TestBed.createComponent(CrmSupersedeEntryModalComponent).componentInstance;

    c.submit();

    expect(supersedeSpace).toHaveBeenCalledWith(
      'E1',
      expect.objectContaining({ spaceId: 'SP1', requirements: 'old', countOrPieces: 2 }),
    );
  });

  it('has Arabic copy for the supersede codes', () => {
    for (const code of [
      'crm.briefs.OnlyLockedSuperseded',
      'crm.briefs.AlreadySuperseded',
      'crm.briefs.SupersedeSpaceMismatch',
    ]) {
      expect(friendlyMessage(code, 'fallback', 'ar')).not.toBe(friendlyMessage(code, 'fallback'));
    }
  });
});

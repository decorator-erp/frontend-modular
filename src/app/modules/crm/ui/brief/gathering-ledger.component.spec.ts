import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { ModalService } from '@ds';
import { PermissionsService } from '@platform/permissions';
import { CrmApprovalsService } from '../../data/crm-approvals.service';
import { CrmBriefService } from '../../data/crm-brief.service';
import { ApprovalState } from '../../model/crm-enums';
import type { BriefHead, BriefSpace } from '../../model';
import { BriefStore } from '../../stores/brief.store';
import { CrmGatheringLedgerComponent } from './gathering-ledger.component';

const HEAD = { id: 'B', projectId: 'P', projectStageId: 'S' } as unknown as BriefHead;

const entry = (id: string, approvalStatus: ApprovalState): BriefSpace => ({
  id,
  briefId: 'B',
  spaceId: null,
  space: null,
  countOrPieces: null,
  requirements: id,
  meetingId: null,
  approvalStatus,
  supersedesSpaceId: null,
  projectTaskId: null,
  createdById: 'E',
  isCurrent: true,
});

function make(can: (p: string) => boolean) {
  const api = {
    getBrief: vi.fn().mockReturnValue(of(HEAD)),
    listSpaces: vi
      .fn()
      .mockReturnValue(
        of([
          entry('draft-entry', ApprovalState.Draft),
          entry('sent-entry', ApprovalState.PendingApproval),
        ]),
      ),
    listRounds: vi.fn().mockReturnValue(of([])),
    sendSpace: vi.fn().mockReturnValue(of(undefined)),
  };
  TestBed.configureTestingModule({
    imports: [CrmGatheringLedgerComponent],
    providers: [
      provideRouter([]),
      BriefStore,
      { provide: CrmBriefService, useValue: api },
      { provide: CrmApprovalsService, useValue: { bySubject: vi.fn().mockReturnValue(of([])) } },
      { provide: ModalService, useValue: { open: vi.fn() } },
      { provide: PermissionsService, useValue: { can } },
    ],
  });
  TestBed.inject(BriefStore).load('P');
  const fixture = TestBed.createComponent(CrmGatheringLedgerComponent);
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  // Open the "General" group.
  (el.querySelector('.divide-y > div > button') as HTMLButtonElement).click();
  fixture.detectChanges();
  const sendButtons = () =>
    Array.from(el.querySelectorAll('li button')).filter(
      (b) => b.textContent?.trim() === 'Send to client',
    ) as HTMLButtonElement[];
  const row = (id: string) =>
    Array.from(el.querySelectorAll('li')).find((li) => li.textContent?.includes(id));
  return { api, sendButtons, row };
}

describe('CrmGatheringLedgerComponent — Send to client (crm-prod M5)', () => {
  it('offers Send to client on a Draft entry only, with crm.briefs.send', () => {
    const { sendButtons, row } = make((p) => p === 'crm.briefs.send');
    expect(sendButtons()).toHaveLength(1);
    expect(row('draft-entry')?.textContent).toContain('Send to client');
    expect(row('sent-entry')?.textContent).not.toContain('Send to client');
  });

  it('sends that entry through sendSpace', () => {
    const { sendButtons, api } = make(() => true);
    sendButtons()[0].click();
    expect(api.sendSpace).toHaveBeenCalledWith('draft-entry');
  });

  it('hides Send to client without crm.briefs.send', () => {
    const { sendButtons } = make((p) => p === 'crm.briefs.manage');
    expect(sendButtons()).toHaveLength(0);
  });
});

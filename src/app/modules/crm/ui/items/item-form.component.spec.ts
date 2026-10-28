import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { of, throwError } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { PERA_MODAL_DATA, PeraModalRef } from '@ds';
import { ToastService } from '@platform/feedback/toast.service';
import { CrmItemService } from '../../data/crm-item.service';
import { CrmMeetingService } from '../../data/crm-meeting.service';
import { ApprovalState } from '../../model/crm-enums';
import type { RequirementItem } from '../../model';
import { CrmItemFormComponent, CrmItemFormDialogData } from './item-form.component';

const existing: RequirementItem = {
  id: 'I',
  projectId: 'P',
  periodId: 'Per',
  category: 1,
  spaceTypeId: 'T',
  room: 'Living',
  title: 'Sofa',
  details: null,
  priority: 2,
  sourceType: null,
  meetingId: null,
  briefId: null,
  noteId: null,
  approvalStatus: ApprovalState.Draft,
  supersedesItemId: null,
  createdByEmployeeId: 'E',
  createdByContactId: null,
  projectTaskId: null,
};

function make(data: CrmItemFormDialogData, api: Partial<CrmItemService>) {
  const close = vi.fn();
  TestBed.configureTestingModule({
    imports: [CrmItemFormComponent],
    providers: [
      { provide: CrmItemService, useValue: api },
      { provide: CrmMeetingService, useValue: { search: vi.fn().mockReturnValue(of([])) } },
      { provide: PERA_MODAL_DATA, useValue: data },
      { provide: PeraModalRef, useValue: { close } },
      { provide: ToastService, useValue: { show: vi.fn() } },
    ],
  });
  const fixture = TestBed.createComponent(CrmItemFormComponent);
  fixture.detectChanges();
  return { c: fixture.componentInstance, close };
}

describe('CrmItemFormComponent (009b #24)', () => {
  it("edit keeps the item's spaceTypeId in the update body", () => {
    const update = vi.fn().mockReturnValue(of(undefined));
    const { c } = make({ projectId: 'P', periodId: 'Per', mode: 'edit', existing }, { update });

    c.submit();

    expect(update).toHaveBeenCalledWith('I', expect.objectContaining({ spaceTypeId: 'T' }));
  });

  it("supersede keeps the item's spaceTypeId", () => {
    const supersede = vi.fn().mockReturnValue(of('I2'));
    const { c } = make(
      { projectId: 'P', periodId: 'Per', mode: 'supersede', existing },
      { supersede },
    );

    c.submit();

    expect(supersede).toHaveBeenCalledWith('I', expect.objectContaining({ spaceTypeId: 'T' }));
  });

  it('closes as done on 409 crm.items.ConcurrentUpdate so the board reloads (X-3)', () => {
    const conflict = new HttpErrorResponse({
      status: 409,
      error: {
        status: 409,
        title: 'crm.items.ConcurrentUpdate',
        errors: { 'crm.items.ConcurrentUpdate': ['x'] },
      },
    });
    const update = vi.fn(() => throwError(() => conflict));
    const { c, close } = make(
      { projectId: 'P', periodId: 'Per', mode: 'edit', existing },
      { update },
    );

    c.submit();

    expect(close).toHaveBeenCalledWith(true);
    expect(c.serverError()).toBeNull();
  });
});

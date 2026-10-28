import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { of, throwError } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { PERA_MODAL_DATA, PeraModalRef } from '@ds';
import { ToastService } from '@platform/feedback/toast.service';
import { CrmMeetingService } from '../../data/crm-meeting.service';
import { CrmRescheduleMeetingComponent } from './reschedule-meeting.component';
import { CrmCancelMeetingComponent } from './cancel-meeting.component';

const SLOT = { startsAtUtc: '2099-01-01T08:00:00Z', endsAtUtc: '2099-01-01T09:00:00Z' };
const conflict = new HttpErrorResponse({
  status: 409,
  error: {
    status: 409,
    title: 'crm.meetings.ConcurrentUpdate',
    errors: { 'crm.meetings.ConcurrentUpdate': ['x'] },
  },
});

function setup(api: Partial<Record<keyof CrmMeetingService, unknown>>) {
  const close = vi.fn();
  TestBed.configureTestingModule({
    providers: [
      { provide: CrmMeetingService, useValue: { freeSlots: () => of([SLOT]), ...api } },
      { provide: PERA_MODAL_DATA, useValue: { meetingId: 'M', projectId: 'P' } },
      { provide: PeraModalRef, useValue: { close } },
      { provide: ToastService, useValue: { show: vi.fn() } },
    ],
  });
  return close;
}

describe('meeting reschedule / cancel forms (009b #21)', () => {
  it('reschedule: 409 crm.meetings.ConcurrentUpdate closes as done so the page reloads (X-3)', () => {
    const close = setup({ reschedule: vi.fn(() => throwError(() => conflict)) });
    const fixture = TestBed.createComponent(CrmRescheduleMeetingComponent);
    fixture.detectChanges();
    const c = fixture.componentInstance;
    (c as unknown as { picked: { set(v: unknown): void } }).picked.set(SLOT);

    c.submit();

    expect(close).toHaveBeenCalledWith(true);
    expect(c.serverError()).toBeNull();
  });

  it('cancel: a ConcurrentUpdate closes as done', () => {
    const close = setup({ cancel: vi.fn(() => throwError(() => conflict)) });
    const fixture = TestBed.createComponent(CrmCancelMeetingComponent);
    fixture.detectChanges();
    const c = fixture.componentInstance;
    c.form.controls.reason.setValue('Client asked');

    c.submit();

    expect(close).toHaveBeenCalledWith(true);
    expect(c.serverError()).toBeNull();
  });
});

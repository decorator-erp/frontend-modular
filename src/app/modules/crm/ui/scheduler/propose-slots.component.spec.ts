import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { of, throwError } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { PERA_MODAL_DATA, PeraModalRef } from '@ds';
import { ToastService } from '@platform/feedback/toast.service';
import { CrmMeetingService } from '../../data/crm-meeting.service';
import { CrmProposeSlotsComponent } from './propose-slots.component';

const SLOT = { startsAtUtc: '2099-01-01T08:00:00Z', endsAtUtc: '2099-01-01T09:00:00Z' };

function make(propose: ReturnType<typeof vi.fn>) {
  const close = vi.fn();
  TestBed.configureTestingModule({
    imports: [CrmProposeSlotsComponent],
    providers: [
      { provide: CrmMeetingService, useValue: { freeSlots: () => of([SLOT]), propose } },
      { provide: PERA_MODAL_DATA, useValue: { projectId: 'P', periodId: 'Per' } },
      { provide: PeraModalRef, useValue: { close } },
      { provide: ToastService, useValue: { show: vi.fn() } },
    ],
  });
  const fixture = TestBed.createComponent(CrmProposeSlotsComponent);
  fixture.detectChanges();
  const c = fixture.componentInstance;
  c.form.controls.title.setValue('Kick-off');
  (c as unknown as { selectedSlots: { set(v: unknown): void } }).selectedSlots.set([SLOT]);
  return { c, close, fixture };
}

describe('CrmProposeSlotsComponent (009b #20)', () => {
  it('proposes without a targetEmployeeId', () => {
    const propose = vi.fn().mockReturnValue(of('M'));
    const { c, close } = make(propose);

    c.submit();

    expect(propose).toHaveBeenCalledTimes(1);
    expect(propose.mock.calls[0][0]).not.toHaveProperty('targetEmployeeId');
    expect(propose.mock.calls[0][0]).toMatchObject({ projectId: 'P', periodId: 'Per' });
    expect(close).toHaveBeenCalledWith(true);
  });

  it('shows the 403 crm.access.NotAnEmployee message in the form', () => {
    const forbidden = new HttpErrorResponse({
      status: 403,
      error: {
        status: 403,
        title: 'crm.access.NotAnEmployee',
        errors: { 'crm.access.NotAnEmployee': ['x'] },
      },
    });
    const { c } = make(vi.fn(() => throwError(() => forbidden)));

    c.submit();

    expect(c.serverError()?.generalMessage).toBe('Only an employee can do this.');
  });
});

describe('CrmProposeSlotsComponent labels (crm-prod M3)', () => {
  it('labels the duration and location fields for what they hold', () => {
    const { fixture } = make(vi.fn());
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Duration (minutes)');
    expect(text).toContain('Location');
    expect(text).not.toContain('Close reminder');
    expect(text).not.toContain('Attach photos');
  });
});

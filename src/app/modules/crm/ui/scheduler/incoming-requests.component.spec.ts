import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { PermissionsService } from '@platform/permissions';
import { MeetingSlotStatus, MeetingStatus, MeetingType } from '../../model/crm-enums';
import type { CrmMeeting } from '../../model';
import { CrmIncomingRequestsComponent } from './incoming-requests.component';

function request(startsAtUtc: string): CrmMeeting {
  return {
    id: 'M',
    projectId: 'P',
    periodId: null,
    title: 'Site visit',
    type: MeetingType.OnSite,
    status: MeetingStatus.Requested,
    scheduledAtUtc: null,
    durationMinutes: 60,
    location: null,
    requestedByEmployeeId: null,
    requestedByContactId: 'K',
    canceledAtUtc: null,
    cancelReason: null,
    createdAtUtc: '2026-10-01T08:00:00Z',
    slots: [
      {
        id: 'S',
        meetingId: 'M',
        startsAtUtc,
        endsAtUtc: startsAtUtc,
        status: MeetingSlotStatus.Proposed,
        proposedByEmployeeId: null,
        proposedByContactId: 'K',
      },
    ],
  };
}

function render(meeting: CrmMeeting): HTMLElement {
  TestBed.configureTestingModule({
    imports: [CrmIncomingRequestsComponent],
    providers: [{ provide: PermissionsService, useValue: { can: () => true } }],
  });
  const fixture = TestBed.createComponent(CrmIncomingRequestsComponent);
  fixture.componentRef.setInput('requests', [meeting]);
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

describe('CrmIncomingRequestsComponent (009b #19)', () => {
  it('renders a request with no "Hold expires" line', () => {
    const el = render(request('2099-01-01T08:00:00Z'));

    expect(el.textContent).toContain('Site visit');
    expect(el.textContent).not.toContain('Hold expires');
  });
});

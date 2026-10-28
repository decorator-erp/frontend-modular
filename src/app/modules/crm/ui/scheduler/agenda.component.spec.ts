import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { PermissionsService } from '@platform/permissions';
import { MeetingStatus, MeetingType } from '../../model/crm-enums';
import type { CrmMeeting } from '../../model';
import { CrmAgendaComponent } from './agenda.component';

function scheduled(scheduledAtUtc: string): CrmMeeting {
  return {
    id: 'M',
    projectId: 'P',
    periodId: null,
    title: 'Walkthrough',
    type: MeetingType.InOffice,
    status: MeetingStatus.Scheduled,
    scheduledAtUtc,
    durationMinutes: 60,
    location: null,
    requestedByEmployeeId: 'E',
    requestedByContactId: null,
    canceledAtUtc: null,
    cancelReason: null,
    createdAtUtc: '2026-10-01T08:00:00Z',
    slots: [],
  };
}

function buttons(meeting: CrmMeeting): string[] {
  TestBed.configureTestingModule({
    imports: [CrmAgendaComponent],
    providers: [{ provide: PermissionsService, useValue: { can: () => true } }],
  });
  const fixture = TestBed.createComponent(CrmAgendaComponent);
  fixture.componentRef.setInput('rows', [meeting]);
  fixture.detectChanges();
  return Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('pera-button')).map(
    (b) => (b.textContent ?? '').trim(),
  );
}

describe('CrmAgendaComponent (009b #21)', () => {
  it('hides Complete / No-show before the meeting starts', () => {
    // Complete + No-show + Reschedule + Cancel would be 4; before the start only the last two show.
    expect(buttons(scheduled('2099-01-01T08:00:00Z'))).toHaveLength(2);
  });

  it('offers Complete / No-show once scheduledAtUtc <= now', () => {
    expect(buttons(scheduled('2020-01-01T08:00:00Z'))).toHaveLength(4);
  });
});

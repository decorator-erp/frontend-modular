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

function buttons(meeting: CrmMeeting, can: (p: string) => boolean = () => true): string[] {
  TestBed.configureTestingModule({
    imports: [CrmAgendaComponent],
    providers: [{ provide: PermissionsService, useValue: { can } }],
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

describe('CrmAgendaComponent labels (crm-prod H1)', () => {
  it('labels the actions Complete and No-show, never "Complete task" / "Decline"', () => {
    const labels = buttons(scheduled('2020-01-01T08:00:00Z'));
    expect(labels).toContain('Complete');
    expect(labels).toContain('No-show');
    expect(labels).not.toContain('Complete task');
    expect(labels).not.toContain('Decline');
  });

  it('shows a NoShow meeting with a No-show chip', () => {
    TestBed.configureTestingModule({
      imports: [CrmAgendaComponent],
      providers: [{ provide: PermissionsService, useValue: { can: () => true } }],
    });
    const fixture = TestBed.createComponent(CrmAgendaComponent);
    fixture.componentRef.setInput('rows', [
      { ...scheduled('2020-01-01T08:00:00Z'), status: MeetingStatus.NoShow },
    ]);
    fixture.detectChanges();
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('No-show');
    expect(text).not.toContain('Decline');
  });
});

describe('CrmAgendaComponent permission gates (crm-prod H2)', () => {
  const started = () => scheduled('2020-01-01T08:00:00Z');

  it('shows No-show with crm.meetings.mark_no_show and without complete', () => {
    const labels = buttons(started(), (p) => p === 'crm.meetings.mark_no_show');
    expect(labels).toEqual(['No-show']);
  });

  it('hides No-show with crm.meetings.complete alone', () => {
    const labels = buttons(started(), (p) => p === 'crm.meetings.complete');
    expect(labels).toEqual(['Complete']);
  });
});

describe('CrmAgendaComponent Reschedule / Cancel (crm-prod M2)', () => {
  const at = (status: MeetingStatus) => ({ ...scheduled('2099-01-01T08:00:00Z'), status });

  it.each([MeetingStatus.Requested, MeetingStatus.Scheduled, MeetingStatus.Rescheduled])(
    'offers Reschedule and Cancel on a live meeting (status %s)',
    (status) => {
      expect(buttons(at(status))).toEqual(['Reschedule', 'Cancel']);
    },
  );

  it.each([MeetingStatus.Completed, MeetingStatus.Canceled, MeetingStatus.NoShow])(
    'offers nothing on a finished meeting (status %s)',
    (status) => {
      expect(buttons(at(status))).toEqual([]);
    },
  );
});

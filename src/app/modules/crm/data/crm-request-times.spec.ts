import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cairoLocalToUtcIso } from '@platform/i18n/intl-locale';
import { environment } from '../../../../environments/environment';
import { MeetingType } from '../model/crm-enums';
import { buildScheduleDays } from '../ui/scheduler/slot-grid.model';
import { CrmMeetingService } from './crm-meeting.service';
import { CrmPeriodService } from './crm-period.service';

/**
 * 009b X-4 (no-op, pinning): request `DateTime`s must be UTC with a `Z` suffix — the meeting
 * validators refuse anything else (contract §1.5), and period times have no validator, so
 * "always send Z". The times below come from the same producers the UI uses: slot cells from
 * `buildScheduleDays` (→ `cairoLocalToUtcIso`), and the period form's `cairoLocalToUtcIso`.
 */
const Z = /Z$/;

describe('CRM request times end in Z (009b X-4)', () => {
  let meetings: CrmMeetingService;
  let periods: CrmPeriodService;
  let http: HttpTestingController;

  const url = (path: string) => `${environment.apiUrl}${path}`;

  // Two office-hour cells, exactly as the slot grid hands them to propose/reschedule/request.
  const [first, second] = buildScheduleDays('2026-11-01T00:00:00.000Z', 7, [], [], 0)
    .flatMap((day) => day.cells)
    .map((cell) => ({ startsAtUtc: cell.startsAtUtc, endsAtUtc: cell.endsAtUtc }));

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    meetings = TestBed.inject(CrmMeetingService);
    periods = TestBed.inject(CrmPeriodService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('propose sends every slot time with Z', () => {
    // No type annotation: the request literal stays valid whatever optional fields the model carries.
    const request = {
      projectId: 'p1',
      title: 'Kick-off',
      type: MeetingType.InOffice,
      targetEmployeeId: 'e1',
      slots: [first, second],
    };
    meetings.propose(request).subscribe();

    const req = http.expectOne(url('/crm/meetings/propose'));
    const slots = (req.request.body as { slots: { startsAtUtc: string; endsAtUtc: string }[] })
      .slots;
    expect(slots).toHaveLength(2);
    for (const slot of slots) {
      expect(slot.startsAtUtc).toMatch(Z);
      expect(slot.endsAtUtc).toMatch(Z);
    }
    req.flush({ meetingId: 'm1' });
  });

  it('reschedule and portalReschedule send the slot with Z', () => {
    meetings.reschedule('m1', first).subscribe();
    meetings.portalReschedule('m1', first).subscribe();

    for (const path of ['/crm/meetings/m1/reschedule', '/crm/portal/meetings/m1/reschedule']) {
      const req = http.expectOne(url(path));
      expect(req.request.body.startsAtUtc).toMatch(Z);
      expect(req.request.body.endsAtUtc).toMatch(Z);
      req.flush(null);
    }
  });

  it('portalRequest sends startsAtUtc/endsAtUtc with Z', () => {
    meetings
      .portalRequest({ projectId: 'p1', title: 'Visit', type: MeetingType.OnSite, ...first })
      .subscribe();

    const req = http.expectOne(url('/crm/portal/meetings/request'));
    expect(req.request.body.startsAtUtc).toMatch(Z);
    expect(req.request.body.endsAtUtc).toMatch(Z);
    req.flush({ meetingId: 'm2' });
  });

  it('period open and extend send the close time with Z', () => {
    const closesAtUtc = cairoLocalToUtcIso('2026-11-20T17:00');
    periods.open('p1', closesAtUtc).subscribe();
    periods.extend('per1', closesAtUtc).subscribe();

    const open = http.expectOne(url('/crm/projects/p1/periods'));
    expect(open.request.body.closesAtUtc).toMatch(Z);
    open.flush({ periodId: 'per1' });

    const extend = http.expectOne(url('/crm/periods/per1/extend'));
    expect(extend.request.body.newClosesAtUtc).toMatch(Z);
    extend.flush(null);
  });
});

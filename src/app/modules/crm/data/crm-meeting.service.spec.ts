import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { PagedResult } from '@platform/types';
import { environment } from '../../../../environments/environment';
import { HANDLED_ERROR_STATUSES } from '@platform/http/handled-errors';
import { MeetingSlotStatus, MeetingType } from '../model/crm-enums';
import type { CrmMeeting, PortalMeeting, PortalMeetingDetail } from '../model';
import { CrmMeetingService } from './crm-meeting.service';

describe('CrmMeetingService', () => {
  let service: CrmMeetingService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [CrmMeetingService, provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(CrmMeetingService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  const url = (path: string) => `${environment.apiUrl}${path}`;

  describe('search (009b #18)', () => {
    it('sends projectId, pageNumber and pageSize and reads the PagedResult', () => {
      let page: PagedResult<CrmMeeting> | undefined;
      service.search('P').subscribe((p) => (page = p));

      const req = http.expectOne((r) => r.url === url('/crm/meetings'));
      expect(req.request.method).toBe('GET');
      expect(req.request.params.get('projectId')).toBe('P');
      expect(req.request.params.get('pageNumber')).toBe('1');
      expect(req.request.params.get('pageSize')).toBe('50');
      expect(req.request.params.has('skip')).toBe(false);
      expect(req.request.params.has('take')).toBe(false);
      req.flush({
        items: [{ id: 'M', projectId: 'P', title: 'Kick-off', slots: [] }],
        pageNumber: 2,
        pageSize: 50,
        totalCount: 51,
        totalPages: 2,
      });

      expect(page?.items.map((m) => m.id)).toEqual(['M']);
      expect(page?.page).toBe(2);
      expect(page?.totalCount).toBe(51);
      expect(page?.totalPages).toBe(2);
    });

    it('passes an explicit page', () => {
      service.search('P', 3, 20).subscribe();

      const req = http.expectOne((r) => r.url === url('/crm/meetings'));
      expect(req.request.params.get('pageNumber')).toBe('3');
      expect(req.request.params.get('pageSize')).toBe('20');
      req.flush({ items: [], pageNumber: 3, pageSize: 20, totalCount: 0, totalPages: 0 });
    });
  });

  describe('getById (009b #19)', () => {
    it('reads CrmMeetingSlotResponse with no employeeId or holdExpiresAtUtc', () => {
      let meeting: CrmMeeting | undefined;
      service.getById('M').subscribe((m) => (meeting = m));

      http.expectOne({ method: 'GET', url: url('/crm/meetings/M') }).flush({
        id: 'M',
        projectId: 'P',
        title: 'Kick-off',
        slots: [
          {
            id: 'S',
            meetingId: 'M',
            startsAtUtc: '2026-11-01T08:00:00Z',
            endsAtUtc: '2026-11-01T09:00:00Z',
            status: MeetingSlotStatus.Proposed,
            proposedByEmployeeId: null,
            proposedByContactId: 'K',
          },
        ],
      });

      expect(meeting?.slots).toEqual([
        {
          id: 'S',
          meetingId: 'M',
          startsAtUtc: '2026-11-01T08:00:00Z',
          endsAtUtc: '2026-11-01T09:00:00Z',
          status: MeetingSlotStatus.Proposed,
          proposedByEmployeeId: null,
          proposedByContactId: 'K',
        },
      ]);
    });
  });

  describe('propose (009b #20)', () => {
    it('sends no targetEmployeeId, marks 403 handled and reads { meetingId }', () => {
      let id: string | undefined;
      service
        .propose({
          projectId: 'P',
          periodId: 'Per',
          title: 'Kick-off',
          type: MeetingType.InOffice,
          location: null,
          durationMinutes: 60,
          slots: [{ startsAtUtc: '2099-01-01T08:00:00Z', endsAtUtc: '2099-01-01T09:00:00Z' }],
        })
        .subscribe((v) => (id = v));

      const req = http.expectOne({ method: 'POST', url: url('/crm/meetings/propose') });
      expect(req.request.body).toEqual({
        projectId: 'P',
        periodId: 'Per',
        title: 'Kick-off',
        type: MeetingType.InOffice,
        location: null,
        durationMinutes: 60,
        slots: [{ startsAtUtc: '2099-01-01T08:00:00Z', endsAtUtc: '2099-01-01T09:00:00Z' }],
      });
      expect(req.request.context.get(HANDLED_ERROR_STATUSES)).toEqual([403]);
      req.flush({ meetingId: 'M' }, { status: 201, statusText: 'Created' });

      expect(id).toBe('M');
    });
  });

  describe('slot actions mark 403 handled (009b #21)', () => {
    it('acceptSlot, declineSlot, portalAcceptSlot and portalDeclineSlot', () => {
      service.acceptSlot('S').subscribe();
      service.declineSlot('S').subscribe();
      service.portalAcceptSlot('S').subscribe();
      service.portalDeclineSlot('S').subscribe();

      for (const path of [
        '/crm/meetings/slots/S/accept',
        '/crm/meetings/slots/S/decline',
        '/crm/portal/meetings/slots/S/accept',
        '/crm/portal/meetings/slots/S/decline',
      ]) {
        const req = http.expectOne({ method: 'PUT', url: url(path) });
        expect(req.request.context.get(HANDLED_ERROR_STATUSES)).toEqual([403]);
        req.flush(null);
      }
    });
  });

  describe('portal reads (009b #44)', () => {
    it('portalList sends pageNumber/pageSize and reads the paged PortalMeetingResponse rows', () => {
      let page: PagedResult<PortalMeeting> | undefined;
      service.portalList().subscribe((p) => (page = p));

      const req = http.expectOne((r) => r.url === url('/crm/portal/meetings'));
      expect(req.request.method).toBe('GET');
      expect(req.request.params.get('pageNumber')).toBe('1');
      expect(req.request.params.get('pageSize')).toBe('50');
      req.flush({
        items: [{ id: 'M', projectId: 'P', title: 'Kick-off', status: 2, scheduledAtUtc: null }],
        pageNumber: 1,
        pageSize: 50,
        totalCount: 1,
        totalPages: 1,
      });

      expect(page?.totalCount).toBe(1);
      expect(page?.items).toEqual([
        { id: 'M', projectId: 'P', title: 'Kick-off', status: 2, scheduledAtUtc: null },
      ]);
    });

    it('portalGetById reads the detail with its slots and proposedByMe', () => {
      let detail: PortalMeetingDetail | undefined;
      service.portalGetById('M').subscribe((d) => (detail = d));

      const req = http.expectOne(url('/crm/portal/meetings/M'));
      expect(req.request.method).toBe('GET');
      req.flush({
        id: 'M',
        projectId: 'P',
        title: 'Kick-off',
        type: MeetingType.Online,
        status: 1,
        scheduledAtUtc: null,
        durationMinutes: 60,
        location: null,
        canceledAtUtc: null,
        cancelReason: null,
        slots: [
          {
            id: 'S1',
            startsAtUtc: '2026-07-20T10:00:00Z',
            endsAtUtc: '2026-07-20T11:00:00Z',
            status: MeetingSlotStatus.Proposed,
            proposedByMe: false,
          },
        ],
      });

      expect(detail?.type).toBe(MeetingType.Online);
      expect(detail?.slots).toEqual([
        {
          id: 'S1',
          startsAtUtc: '2026-07-20T10:00:00Z',
          endsAtUtc: '2026-07-20T11:00:00Z',
          status: MeetingSlotStatus.Proposed,
          proposedByMe: false,
        },
      ]);
    });
  });

  describe('portalRequest (009b #45)', () => {
    it('reads the 201 { meetingId } and marks 403 handled', () => {
      let id: string | undefined;
      service
        .portalRequest({
          projectId: 'P',
          periodId: 'PER',
          title: 'Visit',
          type: MeetingType.OnSite,
          startsAtUtc: '2026-07-20T10:00:00Z',
          endsAtUtc: '2026-07-20T11:00:00Z',
        })
        .subscribe((v) => (id = v));

      const req = http.expectOne(url('/crm/portal/meetings/request'));
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({
        projectId: 'P',
        periodId: 'PER',
        title: 'Visit',
        type: MeetingType.OnSite,
        startsAtUtc: '2026-07-20T10:00:00Z',
        endsAtUtc: '2026-07-20T11:00:00Z',
        location: null,
      });
      expect(req.request.context.get(HANDLED_ERROR_STATUSES)).toEqual([403]);
      req.flush({ meetingId: 'M' }, { status: 201, statusText: 'Created' });

      expect(id).toBe('M');
    });
  });

  // UI-1: the client portal reads its own free-slots route (crm.meetings.request_own).
  describe('portalFreeSlots (UI-1)', () => {
    it('GETs /crm/portal/meetings/free-slots with the project and window', () => {
      let slots: unknown[] = [];
      service
        .portalFreeSlots('P', '2026-11-14T00:00:00Z', '2026-11-21T00:00:00Z')
        .subscribe((v) => (slots = v));
      const req = http.expectOne(
        (r) =>
          r.url === url('/crm/portal/meetings/free-slots') &&
          r.params.get('projectId') === 'P' &&
          r.params.get('fromUtc') === '2026-11-14T00:00:00Z' &&
          r.params.get('toUtc') === '2026-11-21T00:00:00Z',
      );
      expect(req.request.method).toBe('GET');
      req.flush([{ startsAtUtc: '2026-11-15T09:00:00Z', endsAtUtc: '2026-11-15T10:00:00Z' }]);
      expect(slots).toHaveLength(1);
    });
  });
});

import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { NEVER, of, throwError } from 'rxjs';
import { CrmMeetingService } from '../data/crm-meeting.service';
import { MeetingSlotStatus, MeetingStatus, MeetingType } from '../model/crm-enums';
import { ERROR_MESSAGES } from '@platform/errors/error-catalog';
import { ToastService } from '@platform/feedback/toast.service';
import type { PagedResult } from '@platform/types';
import type { CrmMeeting, CrmMeetingSlot, PortalMeeting, PortalMeetingDetail } from '../model';
import {
  isSlotAnswerableByClient,
  isSlotHeld,
  isSlotHoldExpired,
  MeetingsStore,
  PORTAL_REQUEST_FAILED,
} from './meetings.store';

const PROJECT_ID = 'project-1';

function slot(over: Partial<CrmMeetingSlot> = {}): CrmMeetingSlot {
  return {
    id: 'slot-1',
    meetingId: 'meeting-1',
    startsAtUtc: '2026-07-20T10:00:00.000Z',
    endsAtUtc: '2026-07-20T11:00:00.000Z',
    status: MeetingSlotStatus.Proposed,
    proposedByEmployeeId: null,
    proposedByContactId: 'contact-1',
    ...over,
  };
}

function meeting(over: Partial<CrmMeeting> = {}): CrmMeeting {
  return {
    id: 'meeting-1',
    projectId: PROJECT_ID,
    periodId: 'period-1',
    title: 'Kick-off',
    type: MeetingType.Online,
    status: MeetingStatus.Requested,
    scheduledAtUtc: null,
    durationMinutes: 60,
    location: null,
    requestedByEmployeeId: null,
    requestedByContactId: 'contact-1',
    canceledAtUtc: null,
    cancelReason: null,
    createdAtUtc: '2026-07-18T09:00:00.000Z',
    slots: [slot()],
    ...over,
  };
}

/** 009b #18: `search` reads a `PagedResult`. */
function page(items: CrmMeeting[]): PagedResult<CrmMeeting> {
  return { items, totalCount: items.length, page: 1, pageSize: 50, totalPages: 1 };
}

/** 009b #44: the portal list row (no type, no slots) and its detail. */
function portalRow(over: Partial<PortalMeeting> = {}): PortalMeeting {
  return {
    id: 'meeting-1',
    projectId: PROJECT_ID,
    title: 'Kick-off',
    status: MeetingStatus.Requested,
    scheduledAtUtc: null,
    ...over,
  };
}

function portalDetail(over: Partial<PortalMeetingDetail> = {}): PortalMeetingDetail {
  return {
    ...portalRow(),
    type: MeetingType.Online,
    durationMinutes: 60,
    location: null,
    canceledAtUtc: null,
    cancelReason: null,
    slots: [
      {
        id: 'slot-1',
        startsAtUtc: '2026-07-20T10:00:00.000Z',
        endsAtUtc: '2026-07-20T11:00:00.000Z',
        status: MeetingSlotStatus.Proposed,
        proposedByMe: false,
      },
    ],
    ...over,
  };
}

function portalPage(items: PortalMeeting[]): PagedResult<PortalMeeting> {
  return { items, totalCount: items.length, page: 1, pageSize: 50, totalPages: 1 };
}

function apiMock() {
  return {
    search: vi.fn().mockReturnValue(of(page([meeting()]))),
    portalList: vi.fn().mockReturnValue(of(portalPage([portalRow()]))),
    portalGetById: vi.fn((id: string) => of(portalDetail({ id }))),
    freeSlots: vi.fn().mockReturnValue(of([])),
    propose: vi.fn().mockReturnValue(of('new-id')),
    acceptSlot: vi.fn().mockReturnValue(of(undefined)),
    declineSlot: vi.fn().mockReturnValue(of(undefined)),
    reschedule: vi.fn().mockReturnValue(of(undefined)),
    cancel: vi.fn().mockReturnValue(of(undefined)),
    complete: vi.fn().mockReturnValue(of(undefined)),
    noShow: vi.fn().mockReturnValue(of(undefined)),
    portalRequest: vi.fn().mockReturnValue(of('new-id')),
    portalAcceptSlot: vi.fn().mockReturnValue(of(undefined)),
    portalDeclineSlot: vi.fn().mockReturnValue(of(undefined)),
    portalReschedule: vi.fn().mockReturnValue(of(undefined)),
    portalCancel: vi.fn().mockReturnValue(of(undefined)),
  };
}

describe('MeetingsStore', () => {
  let api: ReturnType<typeof apiMock>;

  beforeEach(() => {
    api = apiMock();
    TestBed.configureTestingModule({
      providers: [
        MeetingsStore,
        { provide: CrmMeetingService, useValue: api },
        { provide: ToastService, useValue: { show: vi.fn() } },
      ],
    });
  });

  const store = () => TestBed.inject(MeetingsStore);

  describe('load()', () => {
    it('fetches meetings for the project', () => {
      const s = store();
      s.load(PROJECT_ID);
      expect(api.search).toHaveBeenCalledWith(PROJECT_ID);
      expect(s.meetings()).toHaveLength(1);
      expect(s.loading()).toBe(false);
    });

    it('sets loading true while in flight', () => {
      api.search.mockReturnValueOnce(NEVER);
      const s = store();
      s.load(PROJECT_ID);
      expect(s.loading()).toBe(true);
    });

    it('surfaces a friendly error on failure', () => {
      api.search.mockReturnValue(throwError(() => new Error('boom')));
      const s = store();
      s.load(PROJECT_ID);
      expect(s.error()).toBe('Could not load meetings.');
      expect(s.loading()).toBe(false);
    });

    it('maps the scope 404 crm.meetings.NotFound to notFound, not an error (009b #18)', () => {
      api.search.mockReturnValue(
        throwError(
          () =>
            new HttpErrorResponse({
              status: 404,
              error: { status: 404, title: 'crm.meetings.NotFound' },
            }),
        ),
      );
      const s = store();
      s.load(PROJECT_ID);
      expect(s.notFound()).toBe(true);
      expect(s.error()).toBeNull();
      expect(s.meetings()).toEqual([]);
      expect(s.loading()).toBe(false);
    });
  });

  describe('derived selectors', () => {
    it('incomingRequests is the client-requested, still-Requested meetings only', () => {
      const clientRequested = meeting({
        id: 'm1',
        requestedByContactId: 'c1',
        requestedByEmployeeId: null,
      });
      const employeeProposed = meeting({
        id: 'm2',
        requestedByContactId: null,
        requestedByEmployeeId: 'e1',
      });
      const scheduled = meeting({
        id: 'm3',
        requestedByContactId: 'c2',
        status: MeetingStatus.Scheduled,
      });
      api.search.mockReturnValue(of(page([clientRequested, employeeProposed, scheduled])));
      const s = store();

      s.load(PROJECT_ID);

      expect(s.incomingRequests().map((m) => m.id)).toEqual(['m1']);
    });

    it('agenda sorts by scheduledAtUtc, falling back to createdAtUtc', () => {
      const later = meeting({ id: 'later', scheduledAtUtc: '2026-07-25T10:00:00.000Z' });
      const sooner = meeting({ id: 'sooner', scheduledAtUtc: '2026-07-20T10:00:00.000Z' });
      const unscheduled = meeting({
        id: 'unscheduled',
        scheduledAtUtc: null,
        createdAtUtc: '2026-07-19T00:00:00.000Z',
      });
      api.search.mockReturnValue(of(page([later, sooner, unscheduled])));
      const s = store();

      s.load(PROJECT_ID);

      expect(s.agenda().map((m) => m.id)).toEqual(['unscheduled', 'sooner', 'later']);
    });
  });

  describe('acceptSlot()', () => {
    it('calls the api and reloads the project on success', () => {
      const s = store();
      s.load(PROJECT_ID);
      api.search.mockClear();

      s.acceptSlot('slot-1');

      expect(api.acceptSlot).toHaveBeenCalledWith('slot-1');
      expect(api.search).toHaveBeenCalledWith(PROJECT_ID);
      expect(s.mutating()).toBe(false);
    });

    it('surfaces a friendly error and does not reload on failure', () => {
      api.acceptSlot.mockReturnValue(throwError(() => new Error('boom')));
      const s = store();
      s.load(PROJECT_ID);
      api.search.mockClear();

      s.acceptSlot('slot-1');

      expect(s.error()).toBe('Could not accept the slot.');
      expect(api.search).not.toHaveBeenCalled();
    });
  });

  describe('declineSlot()', () => {
    it('releases the hold — calls the api with no reason, only an optional counter-proposal', () => {
      const s = store();
      s.load(PROJECT_ID);

      s.declineSlot('slot-1', { counterSlots: [{ startsAtUtc: 'a', endsAtUtc: 'b' }] });

      expect(api.declineSlot).toHaveBeenCalledWith('slot-1', {
        counterSlots: [{ startsAtUtc: 'a', endsAtUtc: 'b' }],
      });
    });
  });

  describe('cancel() vs reschedule()', () => {
    it('cancel forwards the mandatory reason', () => {
      const s = store();
      s.cancel('meeting-1', 'client asked to postpone');
      expect(api.cancel).toHaveBeenCalledWith('meeting-1', 'client asked to postpone');
    });

    it('reschedule takes a slot and no reason (an offer, not a withdrawal)', () => {
      const s = store();
      s.reschedule('meeting-1', { startsAtUtc: 'a', endsAtUtc: 'b' });
      expect(api.reschedule).toHaveBeenCalledWith('meeting-1', {
        startsAtUtc: 'a',
        endsAtUtc: 'b',
      });
    });
  });

  describe('portal methods', () => {
    // FINDING-5-13: a route-claim 403 (no code) shows the permission message, not "Could not load".
    it('loadPortal shows the permission message on an uncoded 403', () => {
      api.portalList.mockReturnValue(
        throwError(() => new HttpErrorResponse({ status: 403, error: null })),
      );
      const s = store();

      s.loadPortal(PROJECT_ID);

      expect(s.error()).toBe("You don't have permission to do that.");
    });

    it('loadPortal filters the client’s meetings to one project', () => {
      const other = portalRow({ id: 'm-other', projectId: 'project-2' });
      api.portalList.mockReturnValue(of(portalPage([portalRow(), other])));
      const s = store();

      s.loadPortal(PROJECT_ID);

      expect(s.meetings().map((m) => m.id)).toEqual(['meeting-1']);
    });

    it('loadPortal reads each of the project’s meetings through portalGetById (009b #44)', () => {
      const other = portalRow({ id: 'm-other', projectId: 'project-2' });
      api.portalList.mockReturnValue(of(portalPage([portalRow(), other])));
      const s = store();

      s.loadPortal(PROJECT_ID);

      expect(api.portalGetById).toHaveBeenCalledTimes(1);
      expect(api.portalGetById).toHaveBeenCalledWith('meeting-1');
      const [m] = s.meetings();
      expect(m.type).toBe(MeetingType.Online);
      expect(m.slots).toEqual([
        {
          id: 'slot-1',
          meetingId: 'meeting-1',
          startsAtUtc: '2026-07-20T10:00:00.000Z',
          endsAtUtc: '2026-07-20T11:00:00.000Z',
          status: MeetingSlotStatus.Proposed,
          proposedByEmployeeId: null,
          proposedByContactId: null,
          proposedByMe: false,
        },
      ]);
    });

    it('a failed detail read keeps the bare row, with no slots', () => {
      api.portalGetById.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 404 })));
      const s = store();

      s.loadPortal(PROJECT_ID);

      expect(s.meetings().map((m) => [m.id, m.slots.length])).toEqual([['meeting-1', 0]]);
      expect(s.error()).toBeNull();
    });

    it('portalRequestSlot calls the api and reloads the portal list', () => {
      const s = store();

      s.portalRequestSlot({
        projectId: PROJECT_ID,
        title: 'Kitchen detail',
        type: MeetingType.Online,
        startsAtUtc: 'a',
        endsAtUtc: 'b',
      });

      expect(api.portalRequest).toHaveBeenCalled();
      expect(api.portalList).toHaveBeenCalled();
    });
  });
});

describe('MeetingsStore mutation errors (009b #21)', () => {
  let api: ReturnType<typeof apiMock>;

  beforeEach(() => {
    api = apiMock();
    TestBed.configureTestingModule({
      providers: [
        MeetingsStore,
        { provide: CrmMeetingService, useValue: api },
        { provide: ToastService, useValue: { show: vi.fn() } },
      ],
    });
  });

  const store = () => TestBed.inject(MeetingsStore);

  function coded(status: number, code: string): HttpErrorResponse {
    return new HttpErrorResponse({
      status,
      error: { status, title: code, errors: { [code]: ['x'] } },
    });
  }

  it('loadPortal: a handled 403 shows its catalog message (FINDING-5-7)', () => {
    api.portalList.mockReturnValue(throwError(() => coded(403, 'crm.portal.NotAClient')));
    const s = store();

    s.loadPortal(PROJECT_ID);

    expect(s.error()).toBe(ERROR_MESSAGES['crm.portal.NotAClient']);
    expect(s.loading()).toBe(false);
  });

  it('acceptSlot: 409 crm.meetings.ConcurrentUpdate reloads the list (X-3), no error', () => {
    api.acceptSlot.mockReturnValue(throwError(() => coded(409, 'crm.meetings.ConcurrentUpdate')));
    const s = store();
    s.load(PROJECT_ID);
    api.search.mockClear();

    s.acceptSlot('slot-1');

    expect(api.search).toHaveBeenCalledWith(PROJECT_ID);
    expect(s.error()).toBeNull();
    expect(s.mutating()).toBe(false);
  });

  it('portalAcceptSlot: a ConcurrentUpdate reloads the portal list', () => {
    api.portalAcceptSlot.mockReturnValue(
      throwError(() => coded(409, 'crm.meetings.ConcurrentUpdate')),
    );
    const s = store();
    s.loadPortal(PROJECT_ID);
    api.portalList.mockClear();

    s.portalAcceptSlot('slot-1');

    expect(api.portalList).toHaveBeenCalled();
    expect(s.error()).toBeNull();
  });

  it('declineSlot: a handled 403 crm.meetings.NotCounterparty shows its message', () => {
    api.declineSlot.mockReturnValue(throwError(() => coded(403, 'crm.meetings.NotCounterparty')));
    const s = store();
    s.load(PROJECT_ID);
    api.search.mockClear();

    s.declineSlot('slot-1');

    expect(s.error()).toBe(ERROR_MESSAGES['crm.meetings.NotCounterparty']);
    expect(api.search).not.toHaveBeenCalled();
  });

  it.each([
    ['acceptSlot', 409, 'crm.meetings.SlotExpired'],
    ['complete', 409, 'crm.meetings.InvalidStateTransition'],
    ['noShow', 409, 'crm.meetings.InvalidStateTransition'],
    ['acceptSlot', 404, 'crm.meetings.SlotNotFound'],
    ['portalDeclineSlot', 404, 'crm.portal.NotFound'],
  ] as const)('%s: %i %s shows its catalog message', (method, status, code) => {
    api[method].mockReturnValue(throwError(() => coded(status, code)));
    const s = store();
    s.load(PROJECT_ID);

    (s[method] as (id: string) => void)('x');

    expect(s.error()).toBe(ERROR_MESSAGES[code]);
  });

  it.each([
    [404, 'crm.portal.NotFound'],
    [404, 'crm.periods.NotFound'],
    [409, 'crm.periods.NotOpen'],
    [400, 'crm.meetings.SlotTooLong'],
    [400, 'crm.meetings.InvalidSlotRange'],
    [403, 'crm.access.NotAClient'],
  ] as const)('portalRequestSlot (009b #45): %i %s shows its catalog message', (status, code) => {
    api.portalRequest.mockReturnValue(throwError(() => coded(status, code)));
    const s = store();

    s.portalRequestSlot({
      projectId: PROJECT_ID,
      title: 'Visit',
      type: MeetingType.OnSite,
      startsAtUtc: 'a',
      endsAtUtc: 'b',
    });

    expect(s.error()).toBe(ERROR_MESSAGES[code]);
    expect(s.mutating()).toBe(false);
  });

  it('portalRequestSlot: an uncoded failure keeps the old text', () => {
    api.portalRequest.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 500 })));
    const s = store();

    s.portalRequestSlot({
      projectId: PROJECT_ID,
      title: 'Visit',
      type: MeetingType.OnSite,
      startsAtUtc: 'a',
      endsAtUtc: 'b',
    });

    expect(s.error()).toBe(PORTAL_REQUEST_FAILED);
  });

  it('the dead crm.meetings.SlotUnavailable code is gone from the catalog', () => {
    expect(ERROR_MESSAGES['crm.meetings.SlotUnavailable']).toBeUndefined();
  });
});

describe('isSlotHeld / isSlotHoldExpired (009b #19: the slot start is the expiry)', () => {
  afterEach(() => vi.useRealTimers());

  // The slot response has no holdExpiresAtUtc; a Proposed slot can be accepted until it starts
  // (409 crm.meetings.SlotExpired after that — CrmMeetingSlot.Accept).
  it('a Proposed slot that has not started is held, not expired', () => {
    const s = slot({
      status: MeetingSlotStatus.Proposed,
      startsAtUtc: '2026-07-20T11:00:00.000Z',
    });
    const now = new Date('2026-07-20T10:00:00.000Z').getTime();

    expect(isSlotHeld(s, now)).toBe(true);
    expect(isSlotHoldExpired(s, now)).toBe(false);
  });

  it('a Proposed slot whose start has passed is expired, not held — US2 scenario 5 / T054', () => {
    const s = slot({
      status: MeetingSlotStatus.Proposed,
      startsAtUtc: '2026-07-20T10:00:00.000Z',
    });
    const now = new Date('2026-07-20T10:00:00.000Z').getTime();

    expect(isSlotHeld(s, now)).toBe(false);
    expect(isSlotHoldExpired(s, now)).toBe(true);
  });

  it('an Accepted slot is never held or expired, whatever its start', () => {
    const s = slot({
      status: MeetingSlotStatus.Accepted,
      startsAtUtc: '2026-07-20T09:00:00.000Z',
    });
    const now = new Date('2026-07-20T10:00:00.000Z').getTime();

    expect(isSlotHeld(s, now)).toBe(false);
    expect(isSlotHoldExpired(s, now)).toBe(false);
  });

  it('a Declined slot is neither held nor expired', () => {
    const s = slot({ status: MeetingSlotStatus.Declined });
    const now = new Date('2026-07-19T10:00:00.000Z').getTime();
    expect(isSlotHeld(s, now)).toBe(false);
    expect(isSlotHoldExpired(s, now)).toBe(false);
  });
});

describe('isSlotAnswerableByClient (009b #44: !proposedByMe replaces the proposer-id test)', () => {
  const NOW = Date.parse('2026-07-20T09:00:00.000Z');

  it('a held slot the office proposed (proposedByMe false) is answerable', () => {
    expect(isSlotAnswerableByClient(slot({ proposedByMe: false }), NOW)).toBe(true);
  });

  it("the client's own slot (proposedByMe true) is not", () => {
    expect(isSlotAnswerableByClient(slot({ proposedByMe: true }), NOW)).toBe(false);
  });

  it('a slot that has started, or is no longer Proposed, is not', () => {
    expect(
      isSlotAnswerableByClient(
        slot({ proposedByMe: false }),
        Date.parse('2026-07-20T10:00:00.000Z'),
      ),
    ).toBe(false);
    expect(
      isSlotAnswerableByClient(
        slot({ proposedByMe: false, status: MeetingSlotStatus.Declined }),
        NOW,
      ),
    ).toBe(false);
  });
});

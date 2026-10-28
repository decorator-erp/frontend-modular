import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { NEVER, of, throwError } from 'rxjs';
import { CrmMeetingService } from '../data/crm-meeting.service';
import { MeetingSlotStatus, MeetingStatus, MeetingType } from '../model/crm-enums';
import { ERROR_MESSAGES } from '@platform/errors/error-catalog';
import { ToastService } from '@platform/feedback/toast.service';
import type { PagedResult } from '@platform/types';
import type { CrmMeeting, CrmMeetingSlot } from '../model';
import { isSlotHeld, isSlotHoldExpired, MeetingsStore } from './meetings.store';

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

function apiMock() {
  return {
    search: vi.fn().mockReturnValue(of(page([meeting()]))),
    portalList: vi.fn().mockReturnValue(of([meeting()])),
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
    it('loadPortal filters the client’s meetings to one project', () => {
      const other = meeting({ id: 'm-other', projectId: 'project-2' });
      api.portalList.mockReturnValue(of([meeting(), other]));
      const s = store();

      s.loadPortal(PROJECT_ID);

      expect(s.meetings().map((m) => m.id)).toEqual(['meeting-1']);
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

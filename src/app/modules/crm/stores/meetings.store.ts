import { computed, inject } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import type { Observable } from 'rxjs';
import { injectReloadOnConflict } from '@platform/http/concurrency';
import { ErrorHandlerService, friendly } from '@platform/http/error-handler.service';
import { patchState, signalStore, withComputed, withMethods, withState } from '@ngrx/signals';
import { CrmMeetingService } from '../data/crm-meeting.service';
import { MeetingSlotStatus, MeetingStatus } from '../model/crm-enums';
import type {
  CrmMeeting,
  CrmMeetingSlot,
  DeclineSlotRequest,
  FreeSlot,
  ProposeMeetingRequest,
  RequestMeetingByClientRequest,
  SlotRequest,
} from '../model';

interface MeetingsState {
  meetings: CrmMeeting[];
  freeSlots: FreeSlot[];
  /** Remembered so a mutation can refresh without the caller re-passing it. */
  projectId: string | null;
  loading: boolean;
  loadingSlots: boolean;
  mutating: boolean;
  error: string | null;
  /** 009b #18 (X-5): the project is outside the caller's scope — 404 `crm.meetings.NotFound`. */
  notFound: boolean;
}

const INITIAL: MeetingsState = {
  meetings: [],
  freeSlots: [],
  projectId: null,
  loading: false,
  loadingSlots: false,
  mutating: false,
  error: null,
  notFound: false,
};

/**
 * True while `slot` is genuinely held — `Proposed` and not yet started. 009b #19: the slot response
 * carries no `holdExpiresAtUtc`; a proposed slot can be accepted until its start, after which accept
 * is 409 `crm.meetings.SlotExpired` (`CrmMeetingSlot.Accept`).
 */
export function isSlotHeld(slot: CrmMeetingSlot, nowMs: number = Date.now()): boolean {
  if (slot.status !== MeetingSlotStatus.Proposed) return false;
  return new Date(slot.startsAtUtc).getTime() > nowMs;
}

/**
 * True when a slot's hold has lapsed while still marked `Proposed` — the server has not
 * yet swept it. The client must not render this as still-held (US2 scenario 5's
 * hold-expired edge case, T054): tell the viewer the hold lapsed and to pick again.
 */
export function isSlotHoldExpired(slot: CrmMeetingSlot, nowMs: number = Date.now()): boolean {
  if (slot.status !== MeetingSlotStatus.Proposed) return false;
  return new Date(slot.startsAtUtc).getTime() <= nowMs;
}

/**
 * Meetings for one project — feature-scoped (the `notification.store.ts` idiom, minus
 * root registration). Drives BOTH the employee scheduler (T048–T051) and the client
 * scheduler (T052) — same domain object, different pages providing their own instance.
 * **`rxMethod` is used nowhere in this repo and is not introduced here.**
 */
export const MeetingsStore = signalStore(
  withState<MeetingsState>(INITIAL),

  withComputed((store) => ({
    /**
     * Incoming requests (T048) — meetings the CLIENT initiated (portal `request`) that
     * are still awaiting the employee's accept/decline. Requested + a contact-proposed
     * slot, never an employee-proposed one (those are OUR outgoing proposals).
     */
    incomingRequests: computed(() =>
      store
        .meetings()
        .filter((m) => m.status === MeetingStatus.Requested && m.requestedByContactId !== null),
    ),

    /** The agenda (T049) — every meeting for the period, soonest first. */
    agenda: computed(() =>
      [...store.meetings()].sort((a, b) => {
        const at = a.scheduledAtUtc ?? a.createdAtUtc;
        const bt = b.scheduledAtUtc ?? b.createdAtUtc;
        return at.localeCompare(bt);
      }),
    ),
  })),

  withMethods(
    (
      store,
      api = inject(CrmMeetingService),
      errors = inject(ErrorHandlerService),
      reloadOnConflict = injectReloadOnConflict(),
    ) => {
      /**
       * 009b #21: a mutation's failure. 409 `crm.meetings.ConcurrentUpdate` (an accept racing a
       * decline) reloads the list (X-3) and leaves no error; a coded error (`SlotExpired`,
       * `InvalidStateTransition`, a handled 403 `NotCounterparty`, `SlotNotFound`,
       * `crm.portal.NotFound`, …) shows its catalog message; anything else keeps the old text.
       */
      const fail = (err: unknown, reload: (() => void) | null, fallback: string): void => {
        if (reload && reloadOnConflict(err, reload)) {
          patchState(store, { mutating: false });
          return;
        }
        const parsed = err instanceof HttpErrorResponse ? errors.parse(err) : null;
        patchState(store, { mutating: false, error: parsed?.code ? friendly(parsed) : fallback });
      };
      const officeReload = (): (() => void) | null => {
        const projectId = store.projectId();
        return projectId ? () => methods.load(projectId) : null;
      };
      const portalReload = (): (() => void) | null => {
        const projectId = store.projectId();
        return projectId ? () => methods.loadPortal(projectId) : null;
      };
      /** Runs one mutation: on success refresh through `reload`, on failure `fail`. */
      const mutate = (
        call: Observable<unknown>,
        reload: (() => void) | null,
        fallback: string,
      ): void => {
        patchState(store, { mutating: true, error: null });
        call.subscribe({
          next: () => {
            patchState(store, { mutating: false });
            reload?.();
          },
          error: (err: unknown) => fail(err, reload, fallback),
        });
      };

      const methods = {
        /** Load every meeting for the project (office side). */
        load(projectId: string): void {
          patchState(store, { loading: true, error: null, notFound: false, projectId });
          api.search(projectId).subscribe({
            next: (page) => patchState(store, { meetings: page.items, loading: false }),
            error: (err: unknown) =>
              err instanceof HttpErrorResponse && err.status === 404
                ? patchState(store, { meetings: [], loading: false, notFound: true })
                : patchState(store, { loading: false, error: 'Could not load meetings.' }),
          });
        },

        /** The client's own meetings, filtered to one project (portal has no project param). */
        loadPortal(projectId: string): void {
          patchState(store, { loading: true, error: null, projectId });
          api.portalList().subscribe({
            next: (meetings) =>
              patchState(store, {
                meetings: meetings.filter((m) => m.projectId === projectId),
                loading: false,
              }),
            error: () =>
              patchState(store, { loading: false, error: 'Could not load your meetings.' }),
          });
        },

        /** The server-computed free-slot grid — the client derives nothing. */
        loadFreeSlots(projectId: string, fromUtc: string, toUtc: string): void {
          patchState(store, { loadingSlots: true, error: null });
          api.freeSlots(projectId, fromUtc, toUtc).subscribe({
            next: (freeSlots) => patchState(store, { freeSlots, loadingSlots: false }),
            error: () =>
              patchState(store, { loadingSlots: false, error: 'Could not load free slots.' }),
          });
        },

        /** Employee proposes one or more slots (T050). Refreshes the meeting list on success. */
        propose(request: ProposeMeetingRequest): void {
          patchState(store, { mutating: true, error: null });
          api.propose(request).subscribe({
            next: () => {
              patchState(store, { mutating: false });
              methods.load(request.projectId);
            },
            error: () =>
              patchState(store, { mutating: false, error: 'Could not propose the meeting.' }),
          });
        },

        /** Accept one slot — the meeting becomes Scheduled; competing holds are released server-side. */
        acceptSlot(slotId: string): void {
          mutate(api.acceptSlot(slotId), officeReload(), 'Could not accept the slot.');
        },

        /** Decline one slot, releasing its hold — optionally with a counter-proposal, never a reason. */
        declineSlot(slotId: string, request?: DeclineSlotRequest): void {
          mutate(api.declineSlot(slotId, request), officeReload(), 'Could not decline the slot.');
        },

        /** Reschedule — a NEW slot proposal, an offer, no reason (FR-023 amended). */
        reschedule(meetingId: string, slot: SlotRequest): void {
          mutate(
            api.reschedule(meetingId, slot),
            officeReload(),
            'Could not reschedule the meeting.',
          );
        },

        /** Cancel — the ONE action whose reason is mandatory (enforced by the form, not here). */
        cancel(meetingId: string, reason: string): void {
          mutate(api.cancel(meetingId, reason), officeReload(), 'Could not cancel the meeting.');
        },

        complete(meetingId: string): void {
          mutate(api.complete(meetingId), officeReload(), 'Could not complete the meeting.');
        },

        noShow(meetingId: string): void {
          mutate(api.noShow(meetingId), officeReload(), 'Could not mark the meeting no-show.');
        },

        // ── Client portal ──

        /** The client taps a free slot and requests it directly — lands Requested + Held (FR-023). */
        portalRequestSlot(request: RequestMeetingByClientRequest): void {
          patchState(store, { mutating: true, error: null });
          api.portalRequest(request).subscribe({
            next: () => {
              patchState(store, { mutating: false });
              methods.loadPortal(request.projectId);
            },
            error: () =>
              patchState(store, { mutating: false, error: 'Could not request the meeting.' }),
          });
        },

        portalAcceptSlot(slotId: string): void {
          mutate(api.portalAcceptSlot(slotId), portalReload(), 'Could not accept the slot.');
        },

        portalDeclineSlot(slotId: string, request?: DeclineSlotRequest): void {
          mutate(
            api.portalDeclineSlot(slotId, request),
            portalReload(),
            'Could not decline the slot.',
          );
        },

        portalReschedule(meetingId: string, slot: SlotRequest): void {
          mutate(
            api.portalReschedule(meetingId, slot),
            portalReload(),
            'Could not reschedule the meeting.',
          );
        },

        portalCancel(meetingId: string, reason: string): void {
          mutate(
            api.portalCancel(meetingId, reason),
            portalReload(),
            'Could not cancel the meeting.',
          );
        },
      };
      return methods;
    },
  ),
);

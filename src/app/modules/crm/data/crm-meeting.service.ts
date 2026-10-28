import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { ApiService } from '@platform/http/api.service';
import { handled } from '@platform/http/handled-errors';
import type { PagedResult } from '@platform/types';
import { MeetingSlotStatus, MeetingStatus, MeetingType } from '../model/crm-enums';
import type {
  CancelMeetingRequest,
  CrmMeeting,
  CrmMeetingSlot,
  DeclineSlotRequest,
  FreeSlot,
  ProposeMeetingRequest,
  RequestMeetingByClientRequest,
  SlotRequest,
} from '../model';

/**
 * Meetings — `/api/crm/meetings/*` (office) and `/api/crm/portal/meetings/*` (client).
 * T045 folds both into ONE service, per tasks.md — the portal variants are the same
 * domain object, and the office `MeetingsStore` (T046) drives both sides.
 *
 * **The server computes availability; the client derives nothing.** ⚠️ There is NO
 * `employeeId` param anywhere in this domain — `GET /free-slots` takes only the project, and
 * `propose` takes its proposer from the caller's token (009b #20).
 */
@Injectable({ providedIn: 'root' })
export class CrmMeetingService extends ApiService {
  /** `GET /free-slots?projectId&fromUtc&toUtc` — flat free UTC windows. Permission `crm.meetings.read`. */
  freeSlots(projectId: string, fromUtc: string, toUtc: string): Observable<FreeSlot[]> {
    return this.get<unknown>('/crm/meetings/free-slots', { projectId, fromUtc, toUtc }).pipe(
      map((r) => this.unwrapArray<unknown>(r).map((s) => this.normalizeFreeSlot(s))),
    );
  }

  /**
   * `POST /propose` → `201 { meetingId }` (009b #20). Permission `crm.meetings.schedule`; the proposer
   * is the caller's token. 400 `crm.meetings.SlotTooLong` / `InvalidSlotRange` / `NoSlotsProvided`,
   * 404 `crm.periods.NotFound`, 409 `crm.periods.NotOpen`; 403 `crm.access.NotAnEmployee` is handled
   * by the form (X-6), not the global toast.
   */
  propose(request: ProposeMeetingRequest): Observable<string> {
    return this.post<unknown>(
      '/crm/meetings/propose',
      {
        projectId: request.projectId,
        periodId: request.periodId ?? null,
        title: request.title,
        type: request.type,
        location: request.location ?? null,
        durationMinutes: request.durationMinutes ?? null,
        slots: request.slots,
      },
      { context: handled(403) },
    ).pipe(map((r) => this.unwrapId(r, 'meetingId')));
  }

  /** `PUT /slots/{slotId}/accept` → `204`. Permission `crm.meetings.respond_slot` (counterparty-checked server-side). */
  acceptSlot(slotId: string): Observable<void> {
    return this.put<void>(`/crm/meetings/slots/${slotId}/accept`, {});
  }

  /** `PUT /slots/{slotId}/decline` → `204` — an optional counter-proposal, never a reason. */
  declineSlot(slotId: string, request?: DeclineSlotRequest): Observable<void> {
    return this.put<void>(`/crm/meetings/slots/${slotId}/decline`, {
      counterSlots: request?.counterSlots ?? null,
    });
  }

  /** `PUT /{meetingId}/reschedule` → `204` — a NEW slot proposal, an offer, no reason (FR-023 amended). */
  reschedule(meetingId: string, slot: SlotRequest): Observable<void> {
    return this.put<void>(`/crm/meetings/${meetingId}/reschedule`, slot);
  }

  /** `PUT /{meetingId}/cancel` → `204` — the reason is MANDATORY, the one exception. */
  cancel(meetingId: string, reason: string): Observable<void> {
    return this.put<void>(`/crm/meetings/${meetingId}/cancel`, {
      reason,
    } satisfies CancelMeetingRequest);
  }

  /** `PUT /{meetingId}/complete` → `204`. Permission `crm.meetings.complete`. */
  complete(meetingId: string): Observable<void> {
    return this.put<void>(`/crm/meetings/${meetingId}/complete`, {});
  }

  /** `PUT /{meetingId}/no-show` → `204`. Permission `crm.meetings.mark_no_show`. */
  noShow(meetingId: string): Observable<void> {
    return this.put<void>(`/crm/meetings/${meetingId}/no-show`, {});
  }

  /** `GET /{meetingId}` — the full record with its slots. */
  getById(meetingId: string): Observable<CrmMeeting> {
    return this.get<unknown>(`/crm/meetings/${meetingId}`).pipe(
      map((r) => this.normalizeMeeting(this.unwrap(r))),
    );
  }

  /**
   * `GET /?projectId&pageNumber&pageSize` → `PagedResult<CrmMeetingResponse>`, newest first (009b #18).
   * All three params are required by the route (`int`, not `int?`); `pageSize` is 1..200. A project
   * outside the caller's scope is 404 `crm.meetings.NotFound`.
   */
  search(projectId: string, pageNumber = 1, pageSize = 50): Observable<PagedResult<CrmMeeting>> {
    return this.get<unknown>('/crm/meetings', { projectId, pageNumber, pageSize }).pipe(
      map((r) => {
        const page = this.unwrap(r);
        const items = this.unwrapArray<unknown>(page).map((m) => this.normalizeMeeting(m));
        const size = this.field<number>(page, 'pageSize') ?? pageSize;
        const totalCount = this.field<number>(page, 'totalCount') ?? items.length;
        return {
          items,
          totalCount,
          page: this.field<number>(page, 'pageNumber') ?? pageNumber,
          pageSize: size,
          totalPages:
            this.field<number>(page, 'totalPages') ?? (size ? Math.ceil(totalCount / size) : 1),
        };
      }),
    );
  }

  // ── Client portal — gated on `crm.portal`, not the office `crm.meetings.*` ──

  /**
   * `POST /portal/meetings/request` → `201` `Guid`. The client requests ONE specific
   * slot directly (from the free-slot grid) — not a proposal list. Lands `Requested`
   * with a single held slot (FR-023).
   */
  portalRequest(request: RequestMeetingByClientRequest): Observable<string> {
    return this.post<unknown>('/crm/portal/meetings/request', {
      projectId: request.projectId,
      periodId: request.periodId ?? null,
      title: request.title,
      type: request.type,
      startsAtUtc: request.startsAtUtc,
      endsAtUtc: request.endsAtUtc,
      location: request.location ?? null,
    }).pipe(map((r) => this.unwrap<string>(r)));
  }

  /** `PUT /portal/meetings/slots/{slotId}/accept` → `204` — the client accepts a proposed slot. */
  portalAcceptSlot(slotId: string): Observable<void> {
    return this.put<void>(`/crm/portal/meetings/slots/${slotId}/accept`, {});
  }

  /** `PUT /portal/meetings/slots/{slotId}/decline` → `204` — optional counter-proposal. */
  portalDeclineSlot(slotId: string, request?: DeclineSlotRequest): Observable<void> {
    return this.put<void>(`/crm/portal/meetings/slots/${slotId}/decline`, {
      counterSlots: request?.counterSlots ?? null,
    });
  }

  /** `PUT /portal/meetings/{meetingId}/reschedule` → `204` — no reason, an offer. */
  portalReschedule(meetingId: string, slot: SlotRequest): Observable<void> {
    return this.put<void>(`/crm/portal/meetings/${meetingId}/reschedule`, slot);
  }

  /** `PUT /portal/meetings/{meetingId}/cancel` → `204` — reason mandatory. */
  portalCancel(meetingId: string, reason: string): Observable<void> {
    return this.put<void>(`/crm/portal/meetings/${meetingId}/cancel`, {
      reason,
    } satisfies CancelMeetingRequest);
  }

  /** `GET /portal/meetings` — the client's own meetings, every status. */
  portalList(): Observable<CrmMeeting[]> {
    return this.get<unknown>('/crm/portal/meetings').pipe(
      map((r) => this.unwrapArray<unknown>(r).map((m) => this.normalizeMeeting(m))),
    );
  }

  private normalizeFreeSlot(source: unknown): FreeSlot {
    return {
      startsAtUtc: this.field<string>(source, 'startsAtUtc') ?? '',
      endsAtUtc: this.field<string>(source, 'endsAtUtc') ?? '',
    };
  }

  private normalizeSlot(source: unknown): CrmMeetingSlot {
    return {
      id: this.field<string>(source, 'id') ?? '',
      meetingId: this.field<string>(source, 'meetingId') ?? '',
      startsAtUtc: this.field<string>(source, 'startsAtUtc') ?? '',
      endsAtUtc: this.field<string>(source, 'endsAtUtc') ?? '',
      status: this.field<number>(source, 'status') ?? MeetingSlotStatus.Proposed,
      proposedByEmployeeId: this.field<string | null>(source, 'proposedByEmployeeId') ?? null,
      proposedByContactId: this.field<string | null>(source, 'proposedByContactId') ?? null,
    };
  }

  private normalizeMeeting(source: unknown): CrmMeeting {
    return {
      id: this.field<string>(source, 'id') ?? '',
      projectId: this.field<string>(source, 'projectId') ?? '',
      periodId: this.field<string | null>(source, 'periodId') ?? null,
      title: this.field<string>(source, 'title') ?? '',
      type: this.field<number>(source, 'type') ?? MeetingType.InOffice,
      status: this.field<number>(source, 'status') ?? MeetingStatus.Requested,
      scheduledAtUtc: this.field<string | null>(source, 'scheduledAtUtc') ?? null,
      durationMinutes: this.field<number | null>(source, 'durationMinutes') ?? null,
      location: this.field<string | null>(source, 'location') ?? null,
      requestedByEmployeeId: this.field<string | null>(source, 'requestedByEmployeeId') ?? null,
      requestedByContactId: this.field<string | null>(source, 'requestedByContactId') ?? null,
      canceledAtUtc: this.field<string | null>(source, 'canceledAtUtc') ?? null,
      cancelReason: this.field<string | null>(source, 'cancelReason') ?? null,
      createdAtUtc: this.field<string>(source, 'createdAtUtc') ?? '',
      slots: (this.field<unknown[]>(source, 'slots') ?? []).map((s) => this.normalizeSlot(s)),
    };
  }
}

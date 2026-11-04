import { Injectable } from '@angular/core';
import { map, Observable } from 'rxjs';
import { ApprovalRequest } from '../model/approval.model';
import { ApiService } from '@platform/http/api.service';

/**
 * A pending approval awaiting the current user's decision. The backend exposes no
 * `GET /api/approvals/{id}`, so notification deep-links for approvals resolve the parent project
 * by matching a pending entry (which carries `projectId`). Decided approvals fall out of this list
 * and fall back by design.
 *
 * `subjectType` (`"GateCondition"` | `"DesignBrief"` | `"RequirementItem"` | `"BriefSpace"`,
 * per the real `PendingApprovalResponse` DTO — verified against the backend working tree) lets
 * `NotificationDeepLink` route a CRM approval notification to its OWN screen (the brief page or the
 * items board) instead of just the parent project (T128) — every
 * brief/item/gathering-entry approval notification arrives on this generic `Approval` entity type,
 * never the CRM-specific ones, so this is the band that actually carries that traffic.
 */
export interface PendingApprovalResponse {
  id: string;
  projectId: string;
  subjectId?: string | null;
  subjectType?: string | null;
}

/** Approvals for projects: the pending list, the open gate queue, and gate rejection. */
@Injectable({ providedIn: 'root' })
export class ApprovalService extends ApiService {
  /** Approvals awaiting the caller. Used to resolve an approval notification's parent project. */
  listPending(): Observable<PendingApprovalResponse[]> {
    return this.get<unknown>('/approvals/pending').pipe(
      map((r) => this.unwrapArray<PendingApprovalResponse>(r)),
    );
  }

  /**
   * The open approval-gate queue (`/projects/approval-requests`) — the ManagerApproval inbox.
   *
   * **Deferred (crm-prod F-approvals-route): the backend maps no such route**, and none serves the
   * same need — `GET /api/approvals/pending` is the caller's own approver queue with no project,
   * owner or gate label (`PendingApprovalResponse`), and `/api/approvals/by-subject/…` is one
   * subject's trail (`ApprovalEndpoints.cs:24-40`). Its only screen, the project page's "Open
   * actions" KPI, is hidden (crm-prod B2-fe); nothing may call this until an office-scoped gate
   * queue route ships.
   *
   * There is deliberately no client-side counterpart here. `/api/clients/approval-requests`
   * exists but is SELF-SCOPED to the calling client (`GetClientApprovalRequestsQuery` returns
   * `ClientErrors.NotFound` when the caller's `AppUserId` has no `Clients` row), so it 404s for
   * every office user. Surfacing "waiting on client" on an office screen needs a new
   * office-scoped endpoint, not this one.
   */
  getProjectApprovalRequests(): Observable<ApprovalRequest[]> {
    return this.get<unknown>('/projects/approval-requests').pipe(
      map((r) => this.unwrapArray(r).map((a) => this.normalize(a))),
    );
  }

  /** Reject the stage/task that owns an approval gate. */
  reject(ownerKind: string, ownerId: string, reason?: string): Observable<unknown> {
    const path =
      ownerKind === 'Stage'
        ? `/project-stages/${ownerId}/reject`
        : `/project-tasks/${ownerId}/reject`;
    return this.put(path, { reason: reason ?? null });
  }

  private normalize(source: unknown): ApprovalRequest {
    return {
      gateConditionId: this.field<string>(source, 'gateConditionId', 'id') ?? '',
      ownerKind: String(this.field(source, 'ownerKind') ?? ''),
      ownerId: this.field<string>(source, 'ownerId') ?? '',
      ownerName: this.field<string>(source, 'ownerName') ?? '',
      projectId: this.field<string>(source, 'projectId') ?? '',
      projectName: this.field<string>(source, 'projectName') ?? '',
      projectStageId: this.field<string | null>(source, 'projectStageId') ?? null,
      stageName: this.field<string | null>(source, 'stageName') ?? null,
      approvalType: String(this.field(source, 'approvalType') ?? ''),
      label: this.field<string>(source, 'label') ?? '',
      requestedAtUtc: this.field<string>(source, 'requestedAtUtc') ?? '',
      trackKey: this.trackKeyFor(
        source,
        'ApprovalRequest.gateConditionId',
        'gateConditionId',
        'id',
      ),
    };
  }
}

import { Injectable } from '@angular/core';
import { map, Observable } from 'rxjs';
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

/**
 * Approvals for projects: the pending list and gate rejection. The open gate queue read
 * (`/projects/approval-requests`) is gone: the backend maps no such route (crm-prod
 * F-approvals-route, deferred; FINDING-P2-10 removed the dead method).
 */
@Injectable({ providedIn: 'root' })
export class ApprovalService extends ApiService {
  /** Approvals awaiting the caller. Used to resolve an approval notification's parent project. */
  listPending(): Observable<PendingApprovalResponse[]> {
    return this.get<unknown>('/approvals/pending').pipe(
      map((r) => this.unwrapArray<PendingApprovalResponse>(r)),
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
}

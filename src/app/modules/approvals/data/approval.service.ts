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
  /** Sync S3: `PendingApprovalResponse.ProjectId` — '' when the backend does not know it. */
  projectId: string;
  subjectId?: string | null;
  subjectType?: string | null;
}

/** `ApprovalSubjectType` (dms Approvals.Contracts/Enums.cs:8-15) — the wire sends the int. */
const SUBJECT_TYPE: Record<number, string> = {
  1: 'GateCondition',
  2: 'DesignBrief',
  3: 'RequirementItem',
  4: 'BriefSpace',
  5: 'ProjectDocument',
};

/** One page large enough for a deep-link lookup; the route requires both paging params. */
const PENDING_PAGE_SIZE = 200;

/**
 * Approvals for projects: the pending list and gate rejection. The open gate queue read
 * (`/projects/approval-requests`) is gone: the backend maps no such route (crm-prod
 * F-approvals-route, deferred; FINDING-P2-10 removed the dead method).
 */
@Injectable({ providedIn: 'root' })
export class ApprovalService extends ApiService {
  /**
   * Approvals awaiting the caller. Used to resolve an approval notification's parent project.
   * `GET /api/approvals/pending?pageNumber&pageSize` — both required (dms ApprovalEndpoints.cs:24-31) —
   * answers a `PagedResult<PendingApprovalResponse>`; `subjectType` is an int, mapped to its name.
   */
  listPending(): Observable<PendingApprovalResponse[]> {
    return this.get<unknown>('/approvals/pending', {
      pageNumber: 1,
      pageSize: PENDING_PAGE_SIZE,
    }).pipe(map((r) => this.unwrapArray(r).map((a) => this.normalizePending(a))));
  }

  private normalizePending(source: unknown): PendingApprovalResponse {
    const raw = this.field<unknown>(source, 'subjectType');
    return {
      id: this.field<string>(source, 'id') ?? '',
      projectId: this.field<string | null>(source, 'projectId') ?? '',
      subjectId: this.field<string | null>(source, 'subjectId') ?? null,
      subjectType:
        typeof raw === 'number' ? (SUBJECT_TYPE[raw] ?? null) : ((raw as string) ?? null),
    };
  }

  // crmp review R1-F10: `reject(ownerKind, ownerId)` is removed — it had no caller and PUT
  // `/project-stages/{id}/reject` / `/project-tasks/{id}/reject` no longer exist (gap table P-77, P-105).
}

import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { ApiService } from '@platform/http/api.service';
import { handled } from '@platform/http/handled-errors';
import type { PagedResult } from '@platform/types';
import { ApprovalDecision, ApprovalSubjectType } from '../model/crm-enums';
import type { PortalApproval, PortalApprovalDecision, PortalApprovalStatus } from '../model';

/** One page of the inbox. The backend accepts 1..200 (`GetMyPortalApprovalsQuery`). */
export const PORTAL_APPROVALS_PAGE_SIZE = 20;

/**
 * crm-prod B1-fe: the client's own approvals, in the portal (`CrmPortalEndpoints.cs:69-87`).
 *
 * - `GET /api/crm/portal/approvals?status=pending|decided&pageNumber&pageSize` —
 *   `crm.approvals.view_own` → `PagedResult<PortalApprovalResponse>` `{items, pageNumber,
 *   pageSize, totalCount, totalPages}`, 1-based. Pending rows newest-requested first, decided
 *   rows newest-decided first (server order, kept as is).
 * - `PUT /api/crm/portal/approvals/{approvalId}/decide` — `crm.approvals.decide_own`, body
 *   `{decision, comment}` with the decision as its int (1 Approved, 3 ChangesRequested) → `204`.
 *   400 `crm.portal.InvalidDecision` / `approvals.CommentRequired` / `approvals.CommentTooLong`,
 *   404 `crm.portal.NotFound`, 409 `approvals.AlreadyDecided`, 403 `crm.portal.NotAClient`.
 *
 * A 403 is marked handled on both: the store shows its catalog message instead of the global
 * English toast.
 */
@Injectable({ providedIn: 'root' })
export class CrmPortalApprovalsService extends ApiService {
  list(
    status: PortalApprovalStatus,
    page = 1,
    pageSize = PORTAL_APPROVALS_PAGE_SIZE,
  ): Observable<PagedResult<PortalApproval>> {
    return this.get<unknown>(
      '/crm/portal/approvals',
      { status, pageNumber: page, pageSize },
      { context: handled(403) },
    ).pipe(map((r) => this.normalizePage(r, page, pageSize)));
  }

  /** The comment is trimmed; a blank one goes as `null`. */
  decide(
    approvalId: string,
    decision: PortalApprovalDecision,
    comment: string | null,
  ): Observable<void> {
    const trimmed = comment?.trim() ? comment.trim() : null;
    return this.put<void>(
      `/crm/portal/approvals/${approvalId}/decide`,
      { decision, comment: trimmed },
      { context: handled(403) },
    );
  }

  private normalizeRow(source: unknown): PortalApproval {
    const decision = this.field<number | null>(source, 'decision') ?? null;
    return {
      id: this.field<string>(source, 'id') ?? '',
      subjectType: this.field<number>(source, 'subjectType') ?? ApprovalSubjectType.DesignBrief,
      subjectId: this.field<string>(source, 'subjectId') ?? '',
      projectId: this.field<string>(source, 'projectId') ?? '',
      projectName: this.field<string>(source, 'projectName') ?? '',
      briefId: this.field<string | null>(source, 'briefId') ?? null,
      stageId: this.field<string | null>(source, 'stageId') ?? null,
      stageName: this.field<string | null>(source, 'stageName') ?? null,
      round: this.field<number | null>(source, 'round') ?? null,
      title: this.field<string | null>(source, 'title') ?? null,
      requestedAtUtc: this.field<string>(source, 'requestedAtUtc') ?? '',
      dueAtUtc: this.field<string | null>(source, 'dueAtUtc') ?? null,
      decision: decision === null ? null : (decision as ApprovalDecision),
      decidedAtUtc: this.field<string | null>(source, 'decidedAtUtc') ?? null,
      comment: this.field<string | null>(source, 'comment') ?? null,
      trackKey: this.trackKeyFor(source, 'PortalApproval.id', 'id'),
    };
  }

  private normalizePage(
    response: unknown,
    requestedPage: number,
    requestedPageSize: number,
  ): PagedResult<PortalApproval> {
    const value = this.unwrap<Record<string, unknown>>(response);
    const items = this.unwrapArray<unknown>(value).map((r) => this.normalizeRow(r));
    return {
      items,
      totalCount: this.field<number>(value, 'totalCount') ?? items.length,
      page: this.field<number>(value, 'pageNumber') ?? requestedPage,
      pageSize: this.field<number>(value, 'pageSize') ?? requestedPageSize,
      totalPages: this.field<number>(value, 'totalPages') ?? 0,
    };
  }
}

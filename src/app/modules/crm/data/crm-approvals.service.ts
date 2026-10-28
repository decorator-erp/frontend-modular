import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { ApiService } from '@platform/http/api.service';
import { ApprovalDecision, ApprovalSubjectType } from '../model/crm-enums';
import type { PagedResult } from '@platform/types';
import type { DecideApprovalRequest, PendingApproval } from '../model';

/**
 * Approvals — the office decide flow. 009b #N-2: the client portal's inbox and decide
 * (`GET /api/crm/portal/approvals`, `PUT …/{id}/decide`) have no backend route
 * (`EP/CrmPortalEndpoints.cs:36-153`), so `portalPending`/`decideAsClient` are gone.
 *
 * ## The two wire quirks quarantined here (Principle VI)
 *
 * **1. A hand-serialized STRING enum.** `PendingApprovalResponse.SubjectType` may arrive
 * as its name (`"DesignBrief"`, …) or as an integer; it is mapped to its numeric mirror on
 * the way in: **no string enum may reach a store.**
 *
 * **2. `PagedResult<T>` paging (009b #41).** `ApprovalEndpoints.cs:24-31` binds two REQUIRED
 * `int`s, `pageNumber` (1-based) and `pageSize`, and returns `PagedResult<PendingApprovalResponse>`
 * `{items, pageNumber, pageSize, totalCount, totalPages}`. The page comes back 1-based, unshifted.
 */

/** The reject comment is enforced twice server-side (FluentValidation + the entity). */
export const APPROVAL_COMMENT_MAX = 2000;

@Injectable({ providedIn: 'root' })
export class CrmApprovalsService extends ApiService {
  /** `GET /api/approvals/pending?pageNumber&pageSize` — permission `approvals.read`. Both 1-based and required (009b #41). */
  pending(page = 1, pageSize = 20): Observable<PagedResult<PendingApproval>> {
    return this.get<unknown>('/approvals/pending', { pageNumber: page, pageSize }).pipe(
      map((r) => this.normalizePage(r, page, pageSize)),
    );
  }

  /**
   * `PUT /api/approvals/{id}/decide` — **PUT, not POST**. Office decide. → `204`.
   */
  decide(approvalId: string, request: DecideApprovalRequest): Observable<void> {
    return this.put<void>(`/approvals/${approvalId}/decide`, this.decideBody(request));
  }

  /**
   * A rejection or a changes request MUST carry a comment (009b #42,
   * `ApprovalContracts.cs:24-28`). Whitespace-only counts as empty — which is exactly
   * the spec's edge case, and exactly what the domain entity checks
   * (`string.IsNullOrWhiteSpace`). Mirrored here so the UI never lets the user reach the
   * `approvals.CommentRequired` error.
   */
  private decideBody(request: DecideApprovalRequest): DecideApprovalRequest {
    const comment = request.comment?.trim() ? request.comment.trim() : null;

    if (
      (request.decision === ApprovalDecision.Rejected ||
        request.decision === ApprovalDecision.ChangesRequested) &&
      !comment
    ) {
      throw new Error('A comment is required when rejecting or requesting changes.');
    }

    return {
      decision: request.decision,
      comment: comment ? comment.slice(0, APPROVAL_COMMENT_MAX) : null,
    };
  }

  /**
   * `PendingApprovalResponse {id, subjectType, subjectId, type, round, dueAtUtc?}`
   * (`ApprovalContracts.cs:20-22`, 009b #41). No project, owner or gate label on the wire.
   */
  private normalizePendingApproval(source: unknown): PendingApproval {
    return {
      id: this.field<string>(source, 'id') ?? '',
      subjectType: this.toSubjectType(this.field<unknown>(source, 'subjectType')),
      subjectId: this.field<string>(source, 'subjectId') ?? '',
      type: this.field<number>(source, 'type') ?? 0,
      round: this.field<number>(source, 'round') ?? 0,
      dueAtUtc: this.field<string | null>(source, 'dueAtUtc') ?? null,
      trackKey: this.trackKeyFor(source, 'PendingApproval.id', 'id'),
    };
  }

  /** Accepts the string name OR an integer, so a future server-side fix cannot break us. */
  private toSubjectType(raw: unknown): ApprovalSubjectType {
    if (typeof raw === 'number') return raw as ApprovalSubjectType;
    if (typeof raw === 'string') {
      const byName = ApprovalSubjectType[raw as keyof typeof ApprovalSubjectType];
      if (typeof byName === 'number') return byName;
      const asNumber = Number(raw);
      if (!Number.isNaN(asNumber)) return asNumber as ApprovalSubjectType;
    }
    return ApprovalSubjectType.GateCondition;
  }

  /** Quirk 2: the wire `pageNumber` is already 1-based; it becomes the app's `page` as is. */
  private normalizePage(
    response: unknown,
    requestedPage: number,
    requestedPageSize: number,
  ): PagedResult<PendingApproval> {
    const value = this.unwrap<Record<string, unknown>>(response);
    const items = this.unwrapArray<unknown>(this.field<unknown>(value, 'items') ?? value).map((a) =>
      this.normalizePendingApproval(a),
    );
    return {
      items,
      totalCount: this.field<number>(value, 'totalCount') ?? items.length,
      page: this.field<number>(value, 'pageNumber') ?? requestedPage,
      pageSize: this.field<number>(value, 'pageSize') ?? requestedPageSize,
      totalPages: this.field<number>(value, 'totalPages') ?? 0,
    };
  }
}

import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { ApiService } from '@platform/http/api.service';
import { ApprovalDecision, ApprovalSubjectType } from '../model/crm-enums';
import type { PagedResult } from '@platform/types';
import type { ClientApprovalTrailRow, DecideApprovalRequest, PendingApproval } from '../model';

/**
 * Approvals — the office decide flow, reused by the client portal (Dependency 12).
 *
 * ## The two wire quirks quarantined here (Principle VI)
 *
 * **1. Two hand-serialized STRING enums in an otherwise all-integer payload.** The
 * backend has no `JsonStringEnumConverter`, so every enum on the wire is a bare integer
 * — EXCEPT `ApprovalTrailItemResponse.Decision` (`"Approved" | "Rejected" | null`) and
 * `PendingApprovalResponse.SubjectType` (`"DesignBrief"`, …). One payload, two
 * conventions. Both are mapped to their numeric mirrors on the way in: **no string enum
 * may reach a store.**
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
   * `PUT /api/crm/portal/approvals/{id}/decide` — the CLIENT decides their own assigned
   * approval. Gated on `crm.portal`, which the Client role holds; `projects.read` was
   * deliberately NOT granted to it (Dependency 12).
   *
   * Same body, same `204`. The domain service enforces that the approval's
   * `AssignedContactId` is the caller's contact (`403` otherwise).
   */
  decideAsClient(approvalId: string, request: DecideApprovalRequest): Observable<void> {
    return this.put<void>(`/crm/portal/approvals/${approvalId}/decide`, this.decideBody(request));
  }

  /**
   * `GET /api/crm/portal/approvals` — the client's own inbox. Mirrors
   * `ClientApprovalTrailResponse`, a DIFFERENT shape than the office pending-list row
   * (`PendingApprovalResponse`) — this one carries its own project identity and the
   * decision itself, pending or not, in one row.
   */
  portalPending(): Observable<ClientApprovalTrailRow[]> {
    return this.get<unknown>('/crm/portal/approvals').pipe(
      map((r) => this.unwrapArray<unknown>(r).map((a) => this.normalizeClientRow(a))),
    );
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

  /**
   * Quirk 1a again, on the CLIENT row: `SubjectType` is the same hand-serialized
   * string. Note the wire field is `RoundNumber`, not `Round` — a different DTO than
   * `PendingApprovalResponse`, not a renamed copy of it.
   */
  private normalizeClientRow(source: unknown): ClientApprovalTrailRow {
    return {
      id: this.field<string>(source, 'id') ?? '',
      subjectType: this.toSubjectType(this.field<unknown>(source, 'subjectType')),
      subjectId: this.field<string>(source, 'subjectId') ?? '',
      projectId: this.field<string>(source, 'projectId') ?? '',
      projectName: this.field<string>(source, 'projectName') ?? '',
      round: this.field<number>(source, 'roundNumber') ?? 0,
      createdAtUtc: this.field<string>(source, 'createdAtUtc') ?? '',
      decision: this.toDecision(this.field<unknown>(source, 'decision')),
      decidedAtUtc: this.field<string | null>(source, 'decidedAtUtc') ?? null,
      comment: this.field<string | null>(source, 'comment') ?? null,
      responseDueAtUtc: this.field<string | null>(source, 'responseDueAtUtc') ?? null,
      trackKey: this.trackKeyFor(source, 'ClientApprovalTrailRow.id', 'id'),
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

  /** `null` ⇒ undecided. That is a state, not a parse failure — preserve it. */
  private toDecision(raw: unknown): ApprovalDecision | null {
    if (raw === null || raw === undefined || raw === '') return null;
    if (typeof raw === 'number') return raw as ApprovalDecision;
    if (typeof raw === 'string') {
      const byName = ApprovalDecision[raw as keyof typeof ApprovalDecision];
      if (typeof byName === 'number') return byName;
      const asNumber = Number(raw);
      if (!Number.isNaN(asNumber)) return asNumber as ApprovalDecision;
    }
    return null;
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

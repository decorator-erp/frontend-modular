import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { ApiService } from '@platform/http/api.service';
import { ApprovalSubjectType } from '../model/crm-enums';
import type { PagedResult } from '@platform/types';
import type { PendingApproval } from '../model';

/**
 * Approvals — the office pending list. crm-prod B1-fe: the office `decide()` had no caller in
 * any office flow, so it is gone; the client decides in the portal through
 * `CrmPortalApprovalsService` (`GET /api/crm/portal/approvals`, `PUT …/{id}/decide`).
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

@Injectable({ providedIn: 'root' })
export class CrmApprovalsService extends ApiService {
  /** `GET /api/approvals/pending?pageNumber&pageSize` — permission `approvals.read`. Both 1-based and required (009b #41). */
  pending(page = 1, pageSize = 20): Observable<PagedResult<PendingApproval>> {
    return this.get<unknown>('/approvals/pending', { pageNumber: page, pageSize }).pipe(
      map((r) => this.normalizePage(r, page, pageSize)),
    );
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

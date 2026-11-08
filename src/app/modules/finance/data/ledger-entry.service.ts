import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import {
  AllocateLedgerEntryRequest,
  LedgerEntryResponse,
  PostLedgerEntryRequest,
  ReverseLedgerEntryRequest,
} from '../model/ledger-entry.model';
import { PagedResult } from '@platform/types';
import type { LedgerDirection, LedgerEntryType } from '../model/enums';
import { ApiService } from '@platform/http/api.service';

export interface LedgerEntryQuery {
  direction?: LedgerDirection;
  type?: LedgerEntryType;
  stageId?: string;
  taskId?: string;
  /** ISO date. */
  fromDate?: string;
  /** ISO date. */
  toDate?: string;
  pageNumber?: number;
  pageSize?: number;
}

/**
 * Ledger entries — `api-docs/11-finance.md` Section 3.
 *
 * The ledger is APPEND-ONLY: correct an entry via `reverse`; allocate a
 * payment to an invoice via `allocate`. There is no update or delete.
 *
 * Idempotency: `PostLedgerEntryRequest.reference` SHOULD be a client-generated
 * UUID v4 so retries surface `ledgerEntries.DuplicatePosting` as a recoverable
 * signal — see `newIdempotencyReference()`.
 */
@Injectable({ providedIn: 'root' })
export class LedgerEntryService extends ApiService {
  /** Mint a UUID v4 for the `reference` field. Uses `crypto.randomUUID` when available. */
  newIdempotencyReference(): string {
    const c = (typeof globalThis !== 'undefined' ? globalThis.crypto : undefined) as
      Crypto | undefined;
    if (c?.randomUUID) return c.randomUUID();
    // Fallback (RFC4122 v4-ish) for older runtimes.
    const rnd = (n: number) =>
      Math.floor(Math.random() * 16)
        .toString(16)
        .padStart(1, '0')
        .slice(0, n);
    return `${rnd(8)}-${rnd(4)}-4${rnd(3)}-${(8 + Math.floor(Math.random() * 4)).toString(16)}${rnd(3)}-${rnd(12)}`;
  }

  /** Post a money movement. Returns the new entry's id. */
  postEntry(req: PostLedgerEntryRequest): Observable<string> {
    // Backend's JsonSerializerOptions uses the default numeric EnumConverter
    // (not JsonStringEnumConverter) so string enum names like "Commitment"
    // throw on deserialization. Translate to the 1-based numeric values the
    // .NET enums use: Commitment=1, ActualCost=2, ClientPayment=3; In=1, Out=2.
    const wire = {
      ...req,
      type: ledgerTypeWire(req.type),
      direction: ledgerDirectionWire(req.direction),
    };
    return this.post<unknown>('/ledger-entries', wire).pipe(map((r) => this.unwrap<string>(r)));
  }

  /** Post a mirrored correcting entry. Returns the mirror's id. */
  reverse(id: string, req: ReverseLedgerEntryRequest = {}): Observable<string> {
    return this.post<unknown>(`/ledger-entries/${id}/reverse`, req).pipe(
      map((r) => this.unwrap<string>(r)),
    );
  }

  /** Settle (part of) a payment against an invoice. */
  allocate(id: string, req: AllocateLedgerEntryRequest): Observable<unknown> {
    return this.post(`/ledger-entries/${id}/allocate`, req);
  }

  getById(id: string): Observable<LedgerEntryResponse> {
    return this.get<unknown>(`/ledger-entries/${id}`).pipe(
      map((r) => this.unwrap<LedgerEntryResponse>(r)),
    );
  }

  getByProject(
    projectId: string,
    query: LedgerEntryQuery = {},
  ): Observable<PagedResult<LedgerEntryResponse>> {
    return this.get<unknown>(`/ledger-entries/by-project/${projectId}`, {
      direction: query.direction,
      type: query.type,
      // Sync W1-10: the route binds `projectStageId` / `projectTaskId` (LedgerEntryEndpoints.cs:86-88).
      projectStageId: query.stageId,
      projectTaskId: query.taskId,
      fromDate: query.fromDate,
      toDate: query.toDate,
      skip: ((query.pageNumber ?? 1) - 1) * (query.pageSize ?? 20),
      take: query.pageSize ?? 20,
    }).pipe(
      map((r) => {
        const page = this.normalisePaged<unknown>(r);
        return { ...page, items: page.items.map((e) => this.normaliseListItem(e)) };
      }),
    );
  }

  /**
   * Sync W1-11: `GET /ledger-entries/by-project/{projectId}/unallocated?skip&take` (finance.read;
   * LedgerEntryEndpoints.cs:109) → `PagedResult<UnallocatedLedgerEntryResponse>`. Returns entry id →
   * the unallocated remainder (decimal string), for the payments that still have one.
   */
  getUnallocated(projectId: string, take = 200): Observable<Map<string, string>> {
    return this.get<unknown>(`/ledger-entries/by-project/${projectId}/unallocated`, {
      skip: 0,
      take,
    }).pipe(
      map((r) => {
        const out = new Map<string, string>();
        for (const e of this.normalisePaged<unknown>(r).items) {
          const id = this.field<string>(e, 'id');
          const rest = this.field<number | string>(e, 'unallocatedAmount');
          if (id && rest !== undefined && rest !== null && Number(rest) > 0)
            out.set(id, String(rest));
        }
        return out;
      }),
    );
  }

  /**
   * `LedgerEntryListItemResponse` (LedgerEntryMessages.cs:53). Sync S7: `isReversed` and `note` are
   * read (absent → not reversed, no note); the amount stays the wire value for MoneyService.
   */
  private normaliseListItem(source: unknown): LedgerEntryResponse {
    const row = (source ?? {}) as LedgerEntryResponse;
    return {
      ...row,
      isReversed: this.field<boolean>(source, 'isReversed') ?? false,
      note: this.field<string | null>(source, 'note') ?? null,
    };
  }

  private normalisePaged<T>(response: unknown): PagedResult<T> {
    const value = this.unwrap<Record<string, unknown>>(response);
    const items = this.unwrapArray<T>(this.field<unknown>(value, 'items') ?? value);
    return {
      items,
      totalCount: this.field<number>(value, 'totalCount') ?? items.length,
      page: this.field<number>(value, 'page', 'pageNumber') ?? 1,
      pageSize: this.field<number>(value, 'pageSize') ?? items.length,
      totalPages: this.field<number>(value, 'totalPages') ?? 1,
    };
  }
}

const TYPE_WIRE: Record<LedgerEntryType, number> = {
  Commitment: 1,
  ActualCost: 2,
  ClientPayment: 3,
};
const DIR_WIRE: Record<LedgerDirection, number> = { In: 1, Out: 2 };

function ledgerTypeWire(t: LedgerEntryType): number {
  return TYPE_WIRE[t];
}
function ledgerDirectionWire(d: LedgerDirection): number {
  return DIR_WIRE[d];
}

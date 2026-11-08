import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import {
  ApproveVariationRequest,
  RaiseVariationRequest,
  RejectVariationRequest,
  SetVariationDescriptionRequest,
  SignVariationRequest,
  VariationResponse,
} from '../model/variation.model';
import type { VariationKind, VariationStatus } from '../model/enums';
import { ApiService } from '@platform/http/api.service';

export interface VariationQuery {
  status?: VariationStatus;
  kind?: VariationKind;
  skip?: number;
  take?: number;
}

function pagedParams(q: VariationQuery): Record<string, unknown> {
  return {
    status: q.status,
    kind: q.kind,
    skip: q.skip ?? 0,
    take: q.take ?? 100,
  };
}

function unwrapPagedItems<T>(r: unknown): T[] {
  if (Array.isArray(r)) return r as T[];
  const v = r as { items?: T[] };
  return Array.isArray(v?.items) ? v.items : [];
}

const KIND_WIRE: Record<VariationKind, number> = { ClientDifference: 1, InternalChange: 2 };
function variationKindWire(k: VariationKind): number {
  return KIND_WIRE[k];
}

/**
 * Variations — `api-docs/11-finance.md` Section 5.
 *
 * Lifecycle (dms Finance.Domain/Variation.cs):
 *   Draft → Submitted → Approved → Applied
 *   ↳ Rejected | Cancelled (terminal)
 * A ClientDifference leaves Submitted by being SIGNED (`sign`, with the client and the signed
 * document) — signing is its approval; a plain `approve` answers `SignatureRequired`. An
 * InternalChange leaves Submitted by `approve` with no signature fields.
 *
 * Auto-raised drafts come from server-side budget guards — the UI only needs
 * `setDescription` + `submit` to push them forward.
 */
@Injectable({ providedIn: 'root' })
export class VariationService extends ApiService {
  raise(req: RaiseVariationRequest): Observable<string> {
    // Backend uses numeric enum converter — translate `kind` to its 1-based ordinal.
    const wire = { ...req, kind: variationKindWire(req.kind) };
    return this.post<unknown>('/variations', wire).pipe(map((r) => this.unwrap<string>(r)));
  }

  setDescription(id: string, req: SetVariationDescriptionRequest): Observable<unknown> {
    return this.put(`/variations/${id}/description`, req);
  }

  submit(id: string): Observable<unknown> {
    return this.put(`/variations/${id}/submit`, {});
  }

  approve(id: string, req: ApproveVariationRequest = {}): Observable<unknown> {
    return this.put(`/variations/${id}/approve`, req);
  }

  sign(id: string, req: SignVariationRequest): Observable<unknown> {
    return this.put(`/variations/${id}/sign`, req);
  }

  /** Posts the ledger entry and releases the task gate. */
  apply(id: string): Observable<unknown> {
    return this.put(`/variations/${id}/apply`, {});
  }

  reject(id: string, req: RejectVariationRequest = {}): Observable<unknown> {
    return this.put(`/variations/${id}/reject`, req);
  }

  cancel(id: string): Observable<unknown> {
    return this.put(`/variations/${id}/cancel`, {});
  }

  getById(id: string): Observable<VariationResponse> {
    return this.get<unknown>(`/variations/${id}`).pipe(
      map((r) => this.attachTrackKey(this.unwrap<VariationResponse>(r))),
    );
  }

  getByProject(projectId: string, query: VariationQuery = {}): Observable<VariationResponse[]> {
    return this.get<unknown>(`/variations/by-project/${projectId}`, pagedParams(query)).pipe(
      map((r) =>
        unwrapPagedItems<VariationResponse>(this.unwrap(r)).map((v) => this.attachTrackKey(v)),
      ),
    );
  }

  getByTask(taskId: string, query: VariationQuery = {}): Observable<VariationResponse[]> {
    return this.get<unknown>(`/variations/by-task/${taskId}`, pagedParams(query)).pipe(
      map((r) =>
        unwrapPagedItems<VariationResponse>(this.unwrap(r)).map((v) => this.attachTrackKey(v)),
      ),
    );
  }

  getByStage(stageId: string, query: VariationQuery = {}): Observable<VariationResponse[]> {
    return this.get<unknown>(`/variations/by-stage/${stageId}`, pagedParams(query)).pipe(
      map((r) =>
        unwrapPagedItems<VariationResponse>(this.unwrap(r)).map((v) => this.attachTrackKey(v)),
      ),
    );
  }

  /**
   * This service has no field-by-field normalizer — every response is cast wholesale,
   * since the wire and `VariationResponse` already agree field-for-field. `trackKey` is
   * the one exception: attach it post-cast so a row missing `id` still renders instead of
   * crashing the dashboard's `@for (row of autoVariations(); track row.variation.trackKey)`.
   */
  private attachTrackKey(v: VariationResponse): VariationResponse {
    return { ...v, trackKey: this.trackKeyFor(v, 'VariationResponse.id', 'id') };
  }
}

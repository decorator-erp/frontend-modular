import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { BoqSnapshotResponse, GenerateBoqSnapshotRequest } from '../model/boq-snapshot.model';
import type { BoqSnapshotType } from '../model/enums';
import { ApiService } from '@platform/http/api.service';

/**
 * BOQ snapshots — `api-docs/11-finance.md` Section 6.
 *
 * `Finance.GenerateBoq` for `generate`; `Finance.Read` for `getById` /
 * `getByProject` / `getLatest`. The `getByProject` endpoint returns headers
 * only (no `lines`).
 */
@Injectable({ providedIn: 'root' })
export class BoqSnapshotService extends ApiService {
  generate(req: GenerateBoqSnapshotRequest): Observable<string> {
    // Backend uses numeric enum converter — translate `type` to its 1-based ordinal.
    const wire = { ...req, type: boqTypeWire(req.type) };
    // POST /api/boq-snapshots (root) — BoqSnapshotEndpoints.cs:22 (GenerateAsync).
    return this.post<unknown>('/boq-snapshots', wire).pipe(map((r) => this.unwrap<string>(r)));
  }

  getById(id: string): Observable<BoqSnapshotResponse> {
    return this.get<unknown>(`/boq-snapshots/${id}`).pipe(
      map((r) => this.unwrap<BoqSnapshotResponse>(r)),
    );
  }

  /** Headers only — no `lines`. */
  getByProject(projectId: string): Observable<BoqSnapshotResponse[]> {
    return this.get<unknown>(`/boq-snapshots/by-project/${projectId}`, { skip: 0, take: 100 }).pipe(
      map((r) => this.unwrapArray<BoqSnapshotResponse>(r)),
    );
  }

  getLatest(projectId: string): Observable<BoqSnapshotResponse> {
    // GET /api/boq-snapshots/by-project/{projectId}/latest — BoqSnapshotEndpoints.cs:36.
    return this.get<unknown>(`/boq-snapshots/by-project/${projectId}/latest`).pipe(
      map((r) => this.unwrap<BoqSnapshotResponse>(r)),
    );
  }
}

const BOQ_TYPE_WIRE: Record<BoqSnapshotType, number> = {
  StageClose: 1,
  ProjectFinal: 2,
  Manual: 3,
};
function boqTypeWire(t: BoqSnapshotType): number {
  return BOQ_TYPE_WIRE[t];
}

import { Injectable, inject } from '@angular/core';
import { Observable, forkJoin, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { ApiService } from '@platform/http/api.service';
import { CrmLookupService } from './crm-lookup.service';
import { CrmProvisionStatus } from '../model/crm-enums';
import type {
  CatalogReorderRequest,
  CreateSpaceRequest,
  CrmSpace,
  CrmSpaceType,
  ProvisionGroup,
  ProvisionSummary,
  UpdateSpaceRequest,
} from '../model';

/**
 * Project-scoped space registry + provisioning — `/api/crm/projects/{projectId}/spaces`
 * and `/api/crm/spaces/{spaceId}`. Reads `crm.spaces.read`, writes `crm.spaces.manage`.
 * Verified against `API/Endpoints/CrmSpaceEndpoints.cs` (shipped `bb78f77`).
 */
@Injectable({ providedIn: 'root' })
export class CrmSpaceService extends ApiService {
  private readonly lookup = inject(CrmLookupService);

  /**
   * `GET /api/crm/projects/{projectId}/spaces` — `crm.spaces.read` (009b #28). The route binds
   * no `includeInactive` and always returns inactive spaces, so they are dropped here unless
   * `includeInactive`. `CrmSpaceResponse` carries a flat `spaceTypeId`: each row's `spaceType`
   * is resolved from the `/crm/space-types` list (an unresolvable id keeps blank names).
   */
  list(projectId: string, includeInactive = false): Observable<CrmSpace[]> {
    return forkJoin([
      this.get<unknown>(`/crm/projects/${projectId}/spaces`),
      this.lookup.spaceTypes().pipe(catchError(() => of<CrmSpaceType[]>([]))),
    ]).pipe(
      map(([r, types]) =>
        this.unwrapArray<unknown>(r)
          .map((s) => this.normalizeSpace(s, types))
          .filter((s) => includeInactive || s.isActive),
      ),
    );
  }

  /**
   * `POST /api/crm/projects/{projectId}/spaces` → `201 { spaceId }` — `crm.spaces.manage`
   * (009b #29). A duplicate name is 409 `crm.spaces.DuplicateName`.
   */
  create(projectId: string, request: CreateSpaceRequest): Observable<string> {
    return this.post<unknown>(`/crm/projects/${projectId}/spaces`, {
      spaceTypeId: request.spaceTypeId,
      name: request.name,
      sortOrder: request.sortOrder ?? 0,
      description: request.description ?? null,
    }).pipe(map((r) => this.unwrapId(r, 'spaceId')));
  }

  /** `PUT /api/crm/projects/{projectId}/spaces/reorder` → `204` — `crm.spaces.manage`. */
  reorder(projectId: string, request: CatalogReorderRequest): Observable<void> {
    return this.put<void>(`/crm/projects/${projectId}/spaces/reorder`, request);
  }

  /**
   * `PUT /api/crm/spaces/{spaceId}` → `204` — `crm.spaces.manage`. Rename / retype.
   *
   * ⚠️ Full-replacement PUT: `CrmSpace.Update` assigns `Description` unconditionally, no
   * "omitted means unchanged" branch. `description` is sent on EVERY call, not only when
   * it changed — a caller that renames without re-sending the current description silently
   * wipes it. `?? null` is the house nullable-string normalization, not a "clear it" signal.
   */
  update(spaceId: string, request: UpdateSpaceRequest): Observable<void> {
    return this.put<void>(`/crm/spaces/${spaceId}`, {
      spaceTypeId: request.spaceTypeId,
      name: request.name,
      description: request.description ?? null,
    });
  }

  /** `PUT /api/crm/spaces/{spaceId}/active` → `204` — `crm.spaces.manage`. */
  setActive(spaceId: string, isActive: boolean): Observable<void> {
    return this.put<void>(`/crm/spaces/${spaceId}/active`, { isActive });
  }

  /** `DELETE /api/crm/spaces/{spaceId}` → `204` — `crm.spaces.manage`. Refused while in use. */
  remove(spaceId: string): Observable<void> {
    return this.delete<void>(`/crm/spaces/${spaceId}`);
  }

  /**
   * `GET /api/crm/projects/{projectId}/spaces/provisioning?status=&includeCustom=` —
   * `crm.spaces.read`. The buy list.
   *
   * `includeCustom` is bound and honored here as of backend `f743454` — the route binds the
   * param (`CrmSpaceEndpoints.cs:111`), the handler filters on it (`SpaceQueries.cs:215`),
   * and `ProvisioningGroupResponse.NodeId` is nullable — so custom rows DO reach this read.
   * Same for {@link provisioningSummary}; the two are no longer at different readinesses.
   */
  provisioning(
    projectId: string,
    status?: CrmProvisionStatus | null,
  ): Observable<ProvisionGroup[]> {
    return this.get<unknown>(`/crm/projects/${projectId}/spaces/provisioning`, {
      status: status ?? undefined,
      includeCustom: true,
    }).pipe(
      map((r) => this.unwrapArray<unknown>(r).map((g, i) => this.normalizeProvisionGroup(g, i))),
    );
  }

  /**
   * `GET /api/crm/projects/{projectId}/spaces/provisioning/summary?includeCustom=` —
   * `crm.spaces.read`. The KPI tiles.
   *
   * Live today: `includeCustom` IS bound here (`CrmSpaceEndpoints.cs:122`), so the tile
   * counts include custom rows as soon as this ships — no backend dependency, unlike
   * {@link provisioning}.
   */
  provisioningSummary(projectId: string): Observable<ProvisionSummary[]> {
    return this.get<unknown>(`/crm/projects/${projectId}/spaces/provisioning/summary`, {
      includeCustom: true,
    }).pipe(map((r) => this.unwrapArray<unknown>(r).map((s) => this.normalizeProvisionSummary(s))));
  }

  private normalizeSpace(source: unknown, types: readonly CrmSpaceType[]): CrmSpace {
    const spaceTypeId = this.field<string>(source, 'spaceTypeId') ?? '';
    return {
      id: this.field<string>(source, 'id') ?? '',
      projectId: this.field<string>(source, 'projectId') ?? '',
      spaceType: types.find((t) => t.id === spaceTypeId) ?? {
        id: spaceTypeId,
        code: '',
        nameEn: '',
        nameAr: '',
      },
      name: this.field<string>(source, 'name') ?? '',
      sortOrder: this.field<number>(source, 'sortOrder') ?? 0,
      isActive: this.field<boolean>(source, 'isActive') ?? true,
      description: this.field<string | null>(source, 'description') ?? null,
    };
  }

  private normalizeProvisionGroup(source: unknown, index: number): ProvisionGroup {
    const nodeId = this.field<string | null>(source, 'nodeId') ?? null;
    const spaceItemId = this.field<string | null>(source, 'spaceItemId') ?? null;
    const customName = this.field<string | null>(source, 'customName') ?? null;
    const status = this.field<number>(source, 'status') ?? CrmProvisionStatus.ToBuy;
    return {
      nodeId,
      spaceItemId,
      nameEn: this.field<string>(source, 'nameEn') ?? '',
      nameAr: this.field<string>(source, 'nameAr') ?? '',
      imageUri: this.field<string | null>(source, 'imageUri') ?? null,
      isPurchasable: this.field<boolean>(source, 'isPurchasable') ?? true,
      status,
      occurrences: this.field<number>(source, 'occurrences') ?? 0,
      spaces: this.field<string[]>(source, 'spaces') ?? [],
      isCustom: this.field<boolean>(source, 'isCustom') ?? nodeId === null,
      customName,
      // A provisioning GROUP has no id of its own — its identity IS (what, status), which is
      // what the backend grouped by — so the key is composed rather than read. `trackKeyFor`
      // would hand a row a fresh counter on every refetch and re-render the whole table.
      //
      // A custom line is different: it is exactly ONE board row, and it carries that row's id
      // as `spaceItemId` (backend `f743454`, non-null iff `isCustom`). That id is what tells
      // two customs apart when they are otherwise identical — same null nodeId, same typed
      // text, same status, occurrences:1 each — which is the shape two typed requests under
      // one category actually arrive in. It is also DURABLE across refetches, unlike a
      // position, and `pera-data-table` keys its selection Set on this value.
      //
      // `?? index` is the degraded path for a backend older than `f743454`, which sent no
      // such id: positional, so unique within one response but not across refetches.
      trackKey: nodeId
        ? `node:${nodeId}:${status}`
        : `custom:${spaceItemId ?? index}:${customName ?? ''}:${status}`,
    };
  }

  private normalizeProvisionSummary(source: unknown): ProvisionSummary {
    return {
      spaceId: this.field<string>(source, 'spaceId') ?? '',
      spaceName: this.field<string>(source, 'spaceName') ?? '',
      status: this.field<number>(source, 'status') ?? CrmProvisionStatus.ToBuy,
      count: this.field<number>(source, 'count') ?? 0,
    };
  }
}

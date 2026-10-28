import { Injectable, inject } from '@angular/core';
import { Observable, forkJoin, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { ApiService } from '@platform/http/api.service';
import { CrmLookupService } from './crm-lookup.service';
import type { CreateSpaceRequest, CrmSpace, CrmSpaceType, UpdateSpaceRequest } from '../model';

/**
 * Project-scoped space registry — `/api/crm/projects/{projectId}/spaces` and
 * `/api/crm/spaces/{spaceId}`. Reads `crm.spaces.read`, writes `crm.spaces.manage`.
 * 009b #N-6: only list, create, update and setActive have routes (`EP/CrmSpaceEndpoints.cs:25-71`);
 * reorder, delete and the provisioning reads are gone.
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
}

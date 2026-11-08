import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { ApiService } from '@platform/http/api.service';
import { handled } from '@platform/http/handled-errors';
import type { CrmSpaceType } from '../model';

/**
 * The CRM lookup surface — space types. (Checklist templates were retired in feature
 * 006; the catalog replaced them, served by `CrmCatalogService`.) Stateless per
 * Principle VI.
 */
@Injectable({ providedIn: 'root' })
export class CrmLookupService extends ApiService {
  /**
   * `GET /api/crm/space-types` — permission `crm.space_types.read`.
   *
   * Space types are DATA, not an enum: the backend `SpaceType` enum is deleted. The
   * server orders by `sortOrder` and returns **inactive types too** (009b #27,
   * `GetCrmSpaceTypesQueryHandler.cs:14-17`): pickers for new rows filter `isActive`,
   * labels for existing rows resolve from the full list.
   */
  spaceTypes(): Observable<CrmSpaceType[]> {
    return this.get<unknown>('/crm/space-types').pipe(
      map((r) => this.unwrapArray<unknown>(r).map((s) => this.normalizeSpaceType(s))),
    );
  }

  /**
   * Sync F4a: `POST /api/crm/space-types { code, nameEn, nameAr, sortOrder }` → `201 { spaceTypeId }`
   * (CrmSpaceTypeEndpoints.cs, `crm.space_types.manage`). 409 `crm.space_types.DuplicateCode` is the
   * caller's to show.
   */
  createSpaceType(request: {
    code: string;
    nameEn: string;
    nameAr: string;
    sortOrder: number;
  }): Observable<string> {
    return this.post<unknown>(
      '/crm/space-types',
      {
        code: request.code,
        nameEn: request.nameEn,
        nameAr: request.nameAr,
        sortOrder: request.sortOrder,
      },
      { context: handled(409) },
    ).pipe(map((r) => this.unwrapId(r, 'spaceTypeId')));
  }

  /** Sync F4a: `PUT /api/crm/space-types/{id} { nameEn, nameAr, sortOrder }` → 204 (the code is fixed). */
  updateSpaceType(
    id: string,
    request: { nameEn: string; nameAr: string; sortOrder: number },
  ): Observable<unknown> {
    return this.put(`/crm/space-types/${id}`, {
      nameEn: request.nameEn,
      nameAr: request.nameAr,
      sortOrder: request.sortOrder,
    });
  }

  /** Sync F4a: `PUT /api/crm/space-types/{id}/active { isActive }` → 204. */
  setSpaceTypeActive(id: string, isActive: boolean): Observable<unknown> {
    return this.put(`/crm/space-types/${id}/active`, { isActive });
  }

  private normalizeSpaceType(source: unknown): CrmSpaceType {
    return {
      id: this.field<string>(source, 'id') ?? '',
      code: this.field<string>(source, 'code') ?? '',
      nameEn: this.field<string>(source, 'nameEn') ?? '',
      nameAr: this.field<string>(source, 'nameAr') ?? '',
      sortOrder: this.field<number>(source, 'sortOrder') ?? 0,
      isActive: this.field<boolean>(source, 'isActive') ?? true,
    };
  }
}

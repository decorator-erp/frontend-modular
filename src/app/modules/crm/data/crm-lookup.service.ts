import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { ApiService } from '@platform/http/api.service';
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

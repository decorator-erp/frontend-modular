import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { ApiService } from '@platform/http/api.service';
import { handled } from '@platform/http/handled-errors';

/**
 * Sync F4a: the space type writes (dms CrmSpaceTypeEndpoints.cs, `crm.space_types.manage`). The read
 * stays on `CrmLookupService`; these live apart so only the lazy admin dialog pulls them in.
 */
@Injectable({ providedIn: 'root' })
export class CrmSpaceTypeAdminService extends ApiService {
  /**
   * `POST /api/crm/space-types { code, nameEn, nameAr, sortOrder }` → `201 { spaceTypeId }`. 409
   * `crm.space_types.DuplicateCode` is the caller's to show.
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

  /** `PUT /api/crm/space-types/{id} { nameEn, nameAr, sortOrder }` → 204 (the code is fixed). */
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

  /** `PUT /api/crm/space-types/{id}/active { isActive }` → 204. */
  setSpaceTypeActive(id: string, isActive: boolean): Observable<unknown> {
    return this.put(`/crm/space-types/${id}/active`, { isActive });
  }
}

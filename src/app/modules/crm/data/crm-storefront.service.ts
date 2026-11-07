import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { ApiService, readField } from '@platform/http/api.service';
import { handled } from '@platform/http/handled-errors';
import type {
  AddSpaceSelectionRequest,
  SpaceSelection,
  SpaceSelectionOption,
  UpdateSpaceSelectionRequest,
} from '../model';

/**
 * `CrmSpaceSelectionResponse` → {@link SpaceSelection} (`StorefrontContracts.cs:14-16`). Shared with
 * the brief normalizer: the brief entry's `selections` snapshot has the same shape (#34, #84).
 */
export function normalizeSpaceSelection(source: unknown): SpaceSelection {
  const options = readField<unknown[]>(source, 'options') ?? [];
  return {
    id: readField<string>(source, 'id') ?? '',
    spaceId: readField<string>(source, 'spaceId') ?? '',
    catalogItemId: readField<string>(source, 'catalogItemId') ?? '',
    itemCode: readField<string>(source, 'itemCode') ?? '',
    itemNameEn: readField<string>(source, 'itemNameEn') ?? '',
    itemNameAr: readField<string>(source, 'itemNameAr') ?? '',
    quantity: readField<number>(source, 'quantity') ?? 0,
    notes: readField<string | null>(source, 'notes') ?? null,
    sortOrder: readField<number>(source, 'sortOrder') ?? 0,
    options: options.map((o): SpaceSelectionOption => ({
      attributeId: readField<string>(o, 'attributeId') ?? '',
      attributeNameEn: readField<string>(o, 'attributeNameEn') ?? '',
      attributeNameAr: readField<string>(o, 'attributeNameAr') ?? '',
      optionId: readField<string>(o, 'optionId') ?? '',
      optionCode: readField<string>(o, 'optionCode') ?? '',
      optionNameEn: readField<string>(o, 'optionNameEn') ?? '',
      optionNameAr: readField<string>(o, 'optionNameAr') ?? '',
    })),
  };
}

/** A missing/`null` `selections` member (an entry never sent) reads as `[]`. */
export function normalizeSpaceSelections(source: unknown): SpaceSelection[] {
  return Array.isArray(source) ? source.map(normalizeSpaceSelection) : [];
}

/**
 * crmp C-6: the office storefront of one space — `/api/crm/spaces/{spaceId}/selections`
 * (`Crm.Infrastructure/Endpoints/CrmStorefrontEndpoints.cs:21-58`, contract §2.9.1 #110–#114).
 * Reads `crm.spaces.read`, writes `crm.spaces.manage`. Office only (D3): there is no portal
 * write route. Every write's 400/404/409 is shown by the caller (`handled`).
 */
@Injectable({ providedIn: 'root' })
export class CrmStorefrontService extends ApiService {
  /** #110 `GET …/selections` (:23) → by `sortOrder`, then created time. 404 `crm.spaces.SpaceNotFound`. */
  list(spaceId: string): Observable<SpaceSelection[]> {
    return this.get<unknown>(`/crm/spaces/${spaceId}/selections`, undefined, {
      context: handled(404),
    }).pipe(map((r) => this.unwrapArray<unknown>(r).map(normalizeSpaceSelection)));
  }

  /** #111 `POST …/selections` (:31) → **200** `{ selectionId }`. */
  add(spaceId: string, request: AddSpaceSelectionRequest): Observable<string> {
    return this.post<unknown>(
      `/crm/spaces/${spaceId}/selections`,
      {
        catalogItemId: request.catalogItemId,
        quantity: request.quantity,
        notes: request.notes ?? null,
        options: request.options ?? [],
      },
      { context: handled(400, 404, 409) },
    ).pipe(map((r) => this.unwrapId(r, 'selectionId')));
  }

  /**
   * #112 `PUT …/selections/order` `{ selectionIds }` (:40) → 204. EVERY selection of the space,
   * each once, else 400 `crm.storefront.InvalidOrder`; 409 `crm.storefront.ConcurrentUpdate`.
   */
  reorder(spaceId: string, selectionIds: readonly string[]): Observable<void> {
    return this.put<void>(
      `/crm/spaces/${spaceId}/selections/order`,
      { selectionIds },
      { context: handled(400, 404, 409) },
    );
  }

  /**
   * #113 `PUT …/selections/{selectionId}` (:48) → 204. `options` omitted/`null` keeps the chosen
   * options and `[]` clears them, so `undefined` is sent as `null`; `notes` is full replace.
   */
  update(
    spaceId: string,
    selectionId: string,
    request: UpdateSpaceSelectionRequest,
  ): Observable<void> {
    return this.put<void>(
      `/crm/spaces/${spaceId}/selections/${selectionId}`,
      { quantity: request.quantity, notes: request.notes, options: request.options ?? null },
      { context: handled(400, 404, 409) },
    );
  }

  /** #114 `DELETE …/selections/{selectionId}` (:57) → 204 (hard delete). */
  remove(spaceId: string, selectionId: string): Observable<void> {
    return this.delete<void>(`/crm/spaces/${spaceId}/selections/${selectionId}`, undefined, {
      context: handled(404),
    });
  }
}

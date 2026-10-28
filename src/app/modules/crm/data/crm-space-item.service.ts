import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { ApiService } from '@platform/http/api.service';
import { CatalogAttributeType, CrmProvisionStatus } from '../model/crm-enums';
import type {
  AddSpaceItemRequest,
  CatalogBreadcrumb,
  PromoteCustomSpaceItemRequest,
  SetSpaceItemAttributeValuesRequest,
  SetSpaceItemStatusRequest,
  SpaceCompleteness,
  SpaceItem,
  SpaceItemAttributeValue,
} from '../model';

/**
 * The per-space board — `/api/crm/spaces/{spaceId}/items` + `/completeness`.
 * Reads `crm.spaces.read`, writes `crm.spaces.manage` — EXCEPT {@link promote}, gated
 * `crm.catalog.manage`, because turning a custom row into a catalog reference is a
 * catalog-editing act, not a board-editing one. Verified against
 * `API/Endpoints/CrmSpaceItemEndpoints.cs` at backend `3d400a7`.
 *
 * The board is office working data, not part of the approval ledger — status flips
 * freely and there is no correction round. Attribute values are replace-all per item.
 */
@Injectable({ providedIn: 'root' })
export class CrmSpaceItemService extends ApiService {
  /** `GET /api/crm/spaces/{spaceId}/items?includeCustom=` — `crm.spaces.read`. */
  list(spaceId: string): Observable<SpaceItem[]> {
    return this.get<unknown>(`/crm/spaces/${spaceId}/items`, { includeCustom: true }).pipe(
      map((r) => this.unwrapArray<unknown>(r).map((i) => this.normalizeItem(i))),
    );
  }

  /**
   * `POST /api/crm/spaces/{spaceId}/items` → `201` bare `Guid` — `crm.spaces.manage`.
   * Either a catalog item or a custom entry — see {@link AddSpaceItemRequest}. Enforces
   * applicability and the `Single`-ancestor rule on both paths.
   *
   * The wire's `catalogNodeId` is a non-nullable `Guid`; on the custom path it is
   * OMITTED from the body rather than sent as `null`, because `null` there is a
   * `System.Text.Json` deserialization throw — a bare 400 with no domain code.
   */
  add(spaceId: string, request: AddSpaceItemRequest): Observable<string> {
    const body: Record<string, unknown> = {
      status: request.status ?? CrmProvisionStatus.ToBuy,
      note: request.note ?? null,
      sourceBriefSpaceId: request.sourceBriefSpaceId ?? null,
    };
    if ('catalogNodeId' in request && request.catalogNodeId) {
      body['catalogNodeId'] = request.catalogNodeId;
    } else if ('customName' in request) {
      body['customName'] = request.customName;
      body['customCategoryId'] = request.customCategoryId;
    }
    return this.post<unknown>(`/crm/spaces/${spaceId}/items`, body).pipe(
      map((r) => this.unwrap<string>(r)),
    );
  }

  /**
   * `POST /api/crm/spaces/{spaceId}/items/{itemId}/promote` → `204` — `crm.catalog.manage`.
   * Turns a custom row into a reference to a real catalog item. On success the row's
   * `customName`/`customCategoryId` are cleared server-side and `isCustom` flips to
   * `false` — refetch the board and completeness after this, same as every other board
   * mutation (`mutateBoard` in `spaces.store.ts` already does this).
   */
  promote(
    spaceId: string,
    itemId: string,
    request: PromoteCustomSpaceItemRequest,
  ): Observable<void> {
    return this.post<void>(`/crm/spaces/${spaceId}/items/${itemId}/promote`, {
      catalogItemId: request.catalogItemId,
    });
  }

  /** `PUT /api/crm/spaces/{spaceId}/items/{itemId}/status` → `204` — `crm.spaces.manage`. */
  setStatus(spaceId: string, itemId: string, request: SetSpaceItemStatusRequest): Observable<void> {
    return this.put<void>(`/crm/spaces/${spaceId}/items/${itemId}/status`, {
      status: request.status,
      note: request.note ?? null,
    });
  }

  /**
   * `PUT /api/crm/spaces/{spaceId}/items/{itemId}/attributes` → `204` — `crm.spaces.manage`.
   * Replace-all: anything omitted is cleared.
   */
  setAttributes(
    spaceId: string,
    itemId: string,
    request: SetSpaceItemAttributeValuesRequest,
  ): Observable<void> {
    return this.put<void>(`/crm/spaces/${spaceId}/items/${itemId}/attributes`, {
      values: request.values.map((v) => ({
        attributeId: v.attributeId,
        valueText: v.valueText ?? null,
        valueNumber: v.valueNumber ?? null,
        valueBool: v.valueBool ?? null,
        valueDate: v.valueDate ?? null,
        optionId: v.optionId ?? null,
      })),
    });
  }

  /** `DELETE /api/crm/spaces/{spaceId}/items/{itemId}` → `204` — `crm.spaces.manage`. Soft delete. */
  remove(spaceId: string, itemId: string): Observable<void> {
    return this.delete<void>(`/crm/spaces/${spaceId}/items/${itemId}`);
  }

  /** `GET /api/crm/spaces/{spaceId}/completeness` — `crm.spaces.read`. All three gaps at once. */
  completeness(spaceId: string): Observable<SpaceCompleteness> {
    return this.get<unknown>(`/crm/spaces/${spaceId}/completeness`).pipe(
      map((r) => this.normalizeCompleteness(this.unwrap<unknown>(r))),
    );
  }

  private normalizeItem(source: unknown): SpaceItem {
    const path = this.field<unknown[]>(source, 'path') ?? [];
    const attributes = this.field<unknown[]>(source, 'attributes') ?? [];
    // `null` on a custom row, and that is data — do NOT default it to `''`. An empty
    // string reads as "a catalog row whose id we lost", which is a different claim.
    const catalogItemId = this.field<string | null>(source, 'catalogNodeId') ?? null;
    const customName = this.field<string | null>(source, 'customName') ?? null;
    return {
      id: this.field<string>(source, 'id') ?? '',
      spaceId: this.field<string>(source, 'spaceId') ?? '',
      catalogItemId,
      nodeNameEn: this.field<string>(source, 'nodeNameEn') ?? '',
      nodeNameAr: this.field<string>(source, 'nodeNameAr') ?? '',
      imageUri: this.field<string | null>(source, 'imageUri') ?? null,
      isPurchasable: this.field<boolean>(source, 'isPurchasable') ?? true,
      path: path.map((p) => this.normalizeBreadcrumb(p)),
      status: this.field<number>(source, 'status') ?? CrmProvisionStatus.ToBuy,
      note: this.field<string | null>(source, 'note') ?? null,
      sourceBriefSpaceId: this.field<string | null>(source, 'sourceBriefSpaceId') ?? null,
      attributes: attributes.map((a) => this.normalizeAttributeValue(a)),
      // Trust the flag when the server sends it; fall back to the shape when it doesn't,
      // so a board read from an older build still renders customs as customs.
      isCustom: this.field<boolean>(source, 'isCustom') ?? customName !== null,
      customName,
      customCategoryId: this.field<string | null>(source, 'customCategoryId') ?? null,
      trackKey: this.trackKeyFor(source, 'SpaceItem.id', 'id'),
    };
  }

  private normalizeBreadcrumb(source: unknown): CatalogBreadcrumb {
    return {
      id: this.field<string>(source, 'id') ?? '',
      code: this.field<string>(source, 'code') ?? '',
      nameEn: this.field<string>(source, 'nameEn') ?? '',
      nameAr: this.field<string>(source, 'nameAr') ?? '',
    };
  }

  private normalizeAttributeValue(source: unknown): SpaceItemAttributeValue {
    return {
      attributeId: this.field<string>(source, 'attributeId') ?? '',
      code: this.field<string>(source, 'code') ?? '',
      nameEn: this.field<string>(source, 'nameEn') ?? '',
      nameAr: this.field<string>(source, 'nameAr') ?? '',
      dataType: this.field<number>(source, 'dataType') ?? CatalogAttributeType.Text,
      unit: this.field<string | null>(source, 'unit') ?? null,
      valueText: this.field<string | null>(source, 'valueText') ?? null,
      valueNumber: this.field<number | null>(source, 'valueNumber') ?? null,
      valueBool: this.field<boolean | null>(source, 'valueBool') ?? null,
      valueDate: this.field<string | null>(source, 'valueDate') ?? null,
      optionId: this.field<string | null>(source, 'optionId') ?? null,
      optionNameEn: this.field<string | null>(source, 'optionNameEn') ?? null,
      optionNameAr: this.field<string | null>(source, 'optionNameAr') ?? null,
    };
  }

  private normalizeCompleteness(source: unknown): SpaceCompleteness {
    const branches = this.field<unknown[]>(source, 'missingRequiredBranches') ?? [];
    const singles = this.field<unknown[]>(source, 'singleViolations') ?? [];
    const attrs = this.field<unknown[]>(source, 'missingRequiredAttributes') ?? [];
    return {
      spaceId: this.field<string>(source, 'spaceId') ?? '',
      isComplete: this.field<boolean>(source, 'isComplete') ?? false,
      missingRequiredBranches: branches.map((b) => ({
        branchId: this.field<string>(b, 'branchId') ?? '',
        code: this.field<string>(b, 'code') ?? '',
        nameEn: this.field<string>(b, 'nameEn') ?? '',
        nameAr: this.field<string>(b, 'nameAr') ?? '',
      })),
      singleViolations: singles.map((s) => ({
        branchId: this.field<string>(s, 'branchId') ?? '',
        nameEn: this.field<string>(s, 'nameEn') ?? '',
        nameAr: this.field<string>(s, 'nameAr') ?? '',
        recordedCount: this.field<number>(s, 'recordedCount') ?? 0,
      })),
      missingRequiredAttributes: attrs.map((a) => ({
        spaceItemId: this.field<string>(a, 'spaceItemId') ?? '',
        attributeId: this.field<string>(a, 'attributeId') ?? '',
        code: this.field<string>(a, 'code') ?? '',
        nameEn: this.field<string>(a, 'nameEn') ?? '',
        nameAr: this.field<string>(a, 'nameAr') ?? '',
      })),
    };
  }
}

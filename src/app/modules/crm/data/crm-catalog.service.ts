import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { ApiService } from '@platform/http/api.service';
import { CatalogAttributeType, CatalogSelectionMode } from '../model/crm-enums';
import type {
  AddCatalogAttributeOptionRequest,
  AddCatalogAttributeRequest,
  CatalogAttribute,
  CatalogAttributeOption,
  CatalogBreadcrumb,
  CatalogCategory,
  CatalogItem,
  CatalogReorderRequest,
  CloneCatalogCategoryRequest,
  CreateCatalogCategoryRequest,
  CreateCatalogItemRequest,
  ItemAttributeValue,
  ItemAttributeValueRequest,
  MoveCatalogCategoryRequest,
  UpdateCatalogAttributeOptionRequest,
  UpdateCatalogAttributeRequest,
  UpdateCatalogCategoryRequest,
  UpdateCatalogItemRequest,
} from '../model';

/** Facets for the item feed. `optionId` is only honored together with `attributeId`. */
export interface CatalogItemQuery {
  spaceTypeId?: string | null;
  categoryId?: string | null;
  attributeId?: string | null;
  optionId?: string | null;
  includeInactive?: boolean;
}

/**
 * Global catalog master data — `/api/crm/catalog/*`. Permission-gated but NOT
 * project-scoped: reads need `crm.catalog.read`, writes `crm.catalog.manage`.
 * Verified against `API/Endpoints/CrmCatalogEndpoints.cs` and
 * `API/Endpoints/CrmCatalogV2Endpoints.cs` at backend `3d400a7`.
 *
 * v1 `/nodes` retired from here in Run B's F7 — `subtree()`, `search()`,
 * `createNode`/`updateNode`/`moveNode`/`reorderNodes`/`setNodeActive`/`deleteNode` and
 * `mapSpaceType`/`unmapSpaceType` are gone, each had zero remaining callers once F5's
 * storefront and F6's admin rewrite finished moving onto `CatalogCategory`/`CatalogItem`.
 * `effectiveAttributes()` and the attribute/option CRUD below stay on their `/nodes/...`
 * routes by necessity, not nostalgia — there is no v2 equivalent, and a v2 category id
 * resolves against `/nodes/{id}` exactly as a v1 node id always did (ids were preserved
 * across the split). `GET /catalog/nodes` itself still exists server-side; nothing here
 * calls it. Backend Phase 8 (`DropCatalogV1`) has landed and dropped the v1 TABLES, but
 * kept every `/nodes*` ROUTE as a permanent alias served from v2 storage — there is no
 * further removal coming, and the routes this service calls are not going anywhere.
 *
 * v2 category WRITES (Run B, F6) — `createCategory`/`updateCategory`/`moveCategory`/
 * `reorderCategories`/`setCategoryActive`/`cloneCategory`/`deleteCategory` plus
 * space-type map/unmap — are now wrapped and are what `catalog-admin.store.ts` calls.
 * They did not exist when Run A shipped; verified against
 * `API/Endpoints/CrmCatalogV2Endpoints.cs:103–217` at backend `5849c08`.
 */
@Injectable({ providedIn: 'root' })
export class CrmCatalogService extends ApiService {
  // ── v2 reads ───────────────────────────────────────────────────────────

  /**
   * `GET /api/crm/catalog/tree` — `crm.catalog.read` (009b #34). The whole tree, flat, ordered
   * by depth then `sortOrder`, inactive rows included. The old `categoryId`/`includeInactive`
   * query is gone, so both filters run here: `categoryId` keeps that category and its
   * subtree (by materialised `path`), and inactive rows are dropped unless asked for.
   */
  getCategories(
    categoryId?: string | null,
    includeInactive = false,
  ): Observable<CatalogCategory[]> {
    return this.get<unknown>('/crm/catalog/tree').pipe(
      map((r) =>
        this.unwrapArray<unknown>(r)
          .map((c) => this.normalizeCategory(c))
          .filter(
            (c) =>
              (includeInactive || c.isActive) &&
              (!categoryId || c.id === categoryId || c.path.includes(`/${categoryId}/`)),
          ),
      ),
    );
  }

  /**
   * `GET /api/crm/catalog/categories/{categoryId}/space-types` — `crm.catalog.read`.
   * The category's OWN mappings, as bare ids. Empty anywhere in the chain ⇒ global.
   */
  getCategorySpaceTypes(categoryId: string): Observable<string[]> {
    return this.get<unknown>(`/crm/catalog/categories/${categoryId}/space-types`).pipe(
      map((r) => this.unwrapArray<string>(r)),
    );
  }

  /**
   * `GET /api/crm/catalog/categories/{categoryId}/attributes` — `crm.catalog.read`.
   * Own + every ancestor's, ancestor-first — identical query and result to
   * {@link effectiveAttributes}, which also accepts a category id. Kept as its own method
   * only for callers that want the v2-named route in an otherwise all-v2 call site.
   */
  categoryAttributes(categoryId: string): Observable<CatalogAttribute[]> {
    return this.get<unknown>(`/crm/catalog/categories/${categoryId}/attributes`).pipe(
      map((r) => this.unwrapArray<unknown>(r).map((a) => this.normalizeAttribute(a))),
    );
  }

  /**
   * `GET /api/crm/catalog/categories/{categoryId}/ancestors` — `crm.catalog.read`.
   * Root-to-parent. The route's response is still the v1 node shape underneath
   * (unchanged from `/nodes/{id}/ancestors`, and outside this run's scope to change) —
   * only `{id, code, nameEn, nameAr}` survive normalization, since that is all an
   * ancestor breadcrumb ever needed. `CatalogNode` itself retired from the frontend in
   * F7; this route did not need the full type to begin with.
   */
  categoryAncestors(categoryId: string): Observable<CatalogBreadcrumb[]> {
    return this.get<unknown>(`/crm/catalog/categories/${categoryId}/ancestors`).pipe(
      map((r) => this.unwrapArray<unknown>(r).map((n) => this.normalizeBreadcrumb(n))),
    );
  }

  /**
   * `GET /api/crm/catalog/categories/search?term=&take=` — `crm.catalog.read`.
   * Categories only (contrast the v1 `search()` above, which mixes categories and items).
   * `term` empty is a 400; `take` outside 1–200 is a 400 — both server-side.
   */
  searchCategories(term: string, take = 50): Observable<CatalogCategory[]> {
    return this.get<unknown>('/crm/catalog/categories/search', { term, take }).pipe(
      map((r) => this.unwrapArray<unknown>(r).map((c) => this.normalizeCategory(c))),
    );
  }

  // ── v2 category writes ─────────────────────────────────────────────────

  /** `POST /api/crm/catalog/categories` → `201` bare `Guid` — `crm.catalog.manage`. */
  createCategory(request: CreateCatalogCategoryRequest): Observable<string> {
    return this.post<unknown>('/crm/catalog/categories', {
      parentId: request.parentId ?? null,
      code: request.code,
      nameEn: request.nameEn,
      nameAr: request.nameAr,
      selectionMode: request.selectionMode ?? CatalogSelectionMode.None,
      isRequired: request.isRequired ?? false,
      sortOrder: request.sortOrder ?? 0,
      descriptionEn: request.descriptionEn ?? null,
      descriptionAr: request.descriptionAr ?? null,
      imageUri: request.imageUri ?? null,
    }).pipe(map((r) => this.unwrap<string>(r)));
  }

  /**
   * `PUT /api/crm/catalog/categories/{categoryId}` → `204` — `crm.catalog.manage`.
   * Full replacement of everything except `sortOrder` and `parentId` — see
   * {@link reorderCategories} and {@link moveCategory} for those.
   */
  updateCategory(categoryId: string, request: UpdateCatalogCategoryRequest): Observable<void> {
    return this.put<void>(`/crm/catalog/categories/${categoryId}`, {
      code: request.code,
      nameEn: request.nameEn,
      nameAr: request.nameAr,
      selectionMode: request.selectionMode,
      isRequired: request.isRequired,
      descriptionEn: request.descriptionEn ?? null,
      descriptionAr: request.descriptionAr ?? null,
      imageUri: request.imageUri ?? null,
    });
  }

  /**
   * `PUT /api/crm/catalog/categories/{categoryId}/parent` → `204` — `crm.catalog.manage`.
   * `409 crm.catalog.CycleDetected` / `crm.catalog.InactiveAncestor`,
   * `400 crm.catalog.MaxDepthExceeded` (cap applies to the deepest descendant, not the
   * moved category itself).
   */
  moveCategory(categoryId: string, request: MoveCatalogCategoryRequest): Observable<void> {
    return this.put<void>(`/crm/catalog/categories/${categoryId}/parent`, {
      newParentId: request.newParentId,
    });
  }

  /** `PUT /api/crm/catalog/categories/reorder?parentId=` → `204` — `crm.catalog.manage`. */
  reorderCategories(parentId: string | null, request: CatalogReorderRequest): Observable<void> {
    const query = parentId ? `?parentId=${parentId}` : '';
    return this.put<void>(`/crm/catalog/categories/reorder${query}`, request);
  }

  /**
   * `PUT /api/crm/catalog/categories/{categoryId}/active` → `204` — `crm.catalog.manage`.
   * Cascades to the WHOLE subtree and every item under it, both directions.
   */
  setCategoryActive(categoryId: string, isActive: boolean): Observable<void> {
    return this.put<void>(`/crm/catalog/categories/${categoryId}/active`, { isActive });
  }

  /**
   * `POST /api/crm/catalog/categories/{categoryId}/clone` → `201` bare `Guid` —
   * `crm.catalog.manage`. Deep-copies the subtree — categories, items, item specs,
   * attributes and options.
   */
  cloneCategory(categoryId: string, request: CloneCatalogCategoryRequest): Observable<string> {
    return this.post<unknown>(`/crm/catalog/categories/${categoryId}/clone`, {
      newParentId: request.newParentId ?? null,
      newCode: request.newCode,
    }).pipe(map((r) => this.unwrap<string>(r)));
  }

  /**
   * `DELETE /api/crm/catalog/categories/{categoryId}` → `204` — `crm.catalog.manage`.
   * Hard delete, deepest-first. `409 crm.catalog.NodeInUse` — note the error name is
   * `NodeInUse`, not `CategoryInUse`; there is no such code — raised when the subtree has
   * recorded board rows (custom entries included) or still holds any item.
   */
  deleteCategory(categoryId: string): Observable<void> {
    return this.delete<void>(`/crm/catalog/categories/${categoryId}`);
  }

  /**
   * `POST /api/crm/catalog/categories/{categoryId}/space-types` → `204` (not `201`, even
   * though it's a POST) — `crm.catalog.manage`. `409 crm.catalog.MappingExists`.
   */
  mapCategorySpaceType(categoryId: string, spaceTypeId: string): Observable<void> {
    return this.post<void>(`/crm/catalog/categories/${categoryId}/space-types`, { spaceTypeId });
  }

  /**
   * `DELETE /api/crm/catalog/categories/{categoryId}/space-types/{spaceTypeId}` → `204` —
   * `crm.catalog.manage`. Removing the LAST mapping makes the category global, not hidden.
   */
  unmapCategorySpaceType(categoryId: string, spaceTypeId: string): Observable<void> {
    return this.delete<void>(`/crm/catalog/categories/${categoryId}/space-types/${spaceTypeId}`);
  }

  /**
   * `GET /api/crm/catalog/items?spaceTypeId=&categoryId=&attributeId=&optionId=&includeInactive=`
   * — `crm.catalog.read`. The faceted item feed.
   *
   * `optionId` is only applied **together with** `attributeId`; alone it is silently
   * ignored, so send the pair or neither.
   */
  getItems(query: CatalogItemQuery = {}): Observable<CatalogItem[]> {
    return this.get<unknown>('/crm/catalog/items', {
      spaceTypeId: query.spaceTypeId ?? undefined,
      categoryId: query.categoryId ?? undefined,
      attributeId: query.attributeId ?? undefined,
      optionId: query.optionId ?? undefined,
      includeInactive: query.includeInactive ?? false,
    }).pipe(map((r) => this.unwrapArray<unknown>(r).map((i) => this.normalizeItem(i))));
  }

  /** `GET /api/crm/catalog/items/{itemId}` — `crm.catalog.read`. */
  getItem(itemId: string): Observable<CatalogItem> {
    return this.get<unknown>(`/crm/catalog/items/${itemId}`).pipe(
      map((r) => this.normalizeItem(this.unwrap<unknown>(r))),
    );
  }

  // ── v2 item writes ─────────────────────────────────────────────────────

  /** `POST /api/crm/catalog/items` → `201` bare `Guid` — `crm.catalog.manage`. */
  createItem(request: CreateCatalogItemRequest): Observable<string> {
    return this.post<unknown>('/crm/catalog/items', {
      categoryId: request.categoryId,
      code: request.code,
      nameEn: request.nameEn,
      nameAr: request.nameAr,
      isPurchasable: request.isPurchasable ?? true,
      sortOrder: request.sortOrder ?? 0,
      descriptionEn: request.descriptionEn ?? null,
      descriptionAr: request.descriptionAr ?? null,
      imageUri: request.imageUri ?? null,
    }).pipe(map((r) => this.unwrap<string>(r)));
  }

  /** `PUT /api/crm/catalog/items/{itemId}` → `204` — `crm.catalog.manage`. */
  updateItem(itemId: string, request: UpdateCatalogItemRequest): Observable<void> {
    return this.put<void>(`/crm/catalog/items/${itemId}`, {
      code: request.code,
      nameEn: request.nameEn,
      nameAr: request.nameAr,
      isPurchasable: request.isPurchasable,
      descriptionEn: request.descriptionEn ?? null,
      descriptionAr: request.descriptionAr ?? null,
      imageUri: request.imageUri ?? null,
    });
  }

  /**
   * `PUT /api/crm/catalog/items/{itemId}/category` → `204` — `crm.catalog.manage`.
   * Re-files an item. Separate from {@link updateItem} because the update body has no
   * `categoryId` — moving is its own operation on the backend, not a field edit.
   */
  moveItemToCategory(itemId: string, categoryId: string): Observable<void> {
    return this.put<void>(`/crm/catalog/items/${itemId}/category`, { categoryId });
  }

  /** `PUT /api/crm/catalog/items/{itemId}/active` → `204` — `crm.catalog.manage`. */
  setItemActive(itemId: string, isActive: boolean): Observable<void> {
    return this.put<void>(`/crm/catalog/items/${itemId}/active`, { isActive });
  }

  /**
   * `DELETE /api/crm/catalog/items/{itemId}` → `204` — `crm.catalog.manage`.
   * `409 crm.catalog.ItemInUse` when a board already records it.
   */
  deleteItem(itemId: string): Observable<void> {
    return this.delete<void>(`/crm/catalog/items/${itemId}`);
  }

  /**
   * `PUT /api/crm/catalog/items/{itemId}/attribute-values` → `204` — `crm.catalog.manage`.
   *
   * REPLACE-ALL: an attribute omitted from `values` is CLEARED, not left alone. Send the
   * item's whole resolved set every time, including the values you did not touch.
   */
  setItemAttributeValues(itemId: string, values: ItemAttributeValueRequest[]): Observable<void> {
    return this.put<void>(`/crm/catalog/items/${itemId}/attribute-values`, {
      values: values.map((v) => ({
        attributeId: v.attributeId,
        valueText: v.valueText ?? null,
        valueNumber: v.valueNumber ?? null,
        valueBool: v.valueBool ?? null,
        valueDate: v.valueDate ?? null,
        optionId: v.optionId ?? null,
      })),
    });
  }

  /**
   * `GET /api/crm/catalog/nodes/{nodeId}/attributes` — `crm.catalog.read`.
   * Own + every ancestor's attribute definitions, ancestor-first.
   */
  effectiveAttributes(nodeId: string): Observable<CatalogAttribute[]> {
    return this.get<unknown>(`/crm/catalog/nodes/${nodeId}/attributes`).pipe(
      map((r) => this.unwrapArray<unknown>(r).map((a) => this.normalizeAttribute(a))),
    );
  }

  // `createNode`/`updateNode`/`moveNode`/`reorderNodes`/`setNodeActive`/`deleteNode` and
  // `mapSpaceType`/`unmapSpaceType` — REMOVED (Run B, F7). The v1 node-structure and
  // space-type-targeting writes; their v2 replacements
  // (`createCategory`/`updateCategory`/`moveCategory`/`reorderCategories`/
  // `setCategoryActive`/`deleteCategory`/`mapCategorySpaceType`/`unmapCategorySpaceType`
  // above) are what `catalog-admin.store.ts` has called since F6. Each had zero callers
  // left by the time F7 started — confirmed by grep, not assumed.

  // ── Attributes + options ───────────────────────────────────────────────

  /** `POST /api/crm/catalog/nodes/{nodeId}/attributes` → `201` bare `Guid` — `crm.catalog.manage`. */
  addAttribute(nodeId: string, request: AddCatalogAttributeRequest): Observable<string> {
    return this.post<unknown>(`/crm/catalog/nodes/${nodeId}/attributes`, {
      code: request.code,
      nameEn: request.nameEn,
      nameAr: request.nameAr,
      dataType: request.dataType,
      unit: request.unit ?? null,
      isRequired: request.isRequired ?? false,
      sortOrder: request.sortOrder ?? 0,
    }).pipe(map((r) => this.unwrap<string>(r)));
  }

  /** `PUT /api/crm/catalog/attributes/{attributeId}` → `204` — `crm.catalog.manage`. */
  updateAttribute(attributeId: string, request: UpdateCatalogAttributeRequest): Observable<void> {
    return this.put<void>(`/crm/catalog/attributes/${attributeId}`, {
      code: request.code,
      nameEn: request.nameEn,
      nameAr: request.nameAr,
      unit: request.unit ?? null,
      isRequired: request.isRequired,
    });
  }

  /** `DELETE /api/crm/catalog/attributes/{attributeId}` → `204` — `crm.catalog.manage`. */
  deleteAttribute(attributeId: string): Observable<void> {
    return this.delete<void>(`/crm/catalog/attributes/${attributeId}`);
  }

  // NOTE — `PUT /nodes/{id}/attributes/reorder` is not wrapped: attributes render in server
  // order and no screen reorders them. Options DO reorder (see `reorderOptions`).

  /** `POST /api/crm/catalog/attributes/{attributeId}/options` → `201` bare `Guid` — `crm.catalog.manage`. */
  addOption(attributeId: string, request: AddCatalogAttributeOptionRequest): Observable<string> {
    return this.post<unknown>(`/crm/catalog/attributes/${attributeId}/options`, {
      code: request.code,
      nameEn: request.nameEn,
      nameAr: request.nameAr,
      imageUri: request.imageUri ?? null,
      sortOrder: request.sortOrder ?? 0,
    }).pipe(map((r) => this.unwrap<string>(r)));
  }

  /** `PUT /api/crm/catalog/options/{optionId}` → `204` — `crm.catalog.manage`. */
  updateOption(optionId: string, request: UpdateCatalogAttributeOptionRequest): Observable<void> {
    return this.put<void>(`/crm/catalog/options/${optionId}`, {
      code: request.code,
      nameEn: request.nameEn,
      nameAr: request.nameAr,
      imageUri: request.imageUri ?? null,
    });
  }

  /** `DELETE /api/crm/catalog/options/{optionId}` → `204` — `crm.catalog.manage`. */
  deleteOption(optionId: string): Observable<void> {
    return this.delete<void>(`/crm/catalog/options/${optionId}`);
  }

  /** `PUT /api/crm/catalog/attributes/{attributeId}/options/reorder` → `204` — `crm.catalog.manage`. */
  reorderOptions(attributeId: string, request: CatalogReorderRequest): Observable<void> {
    return this.put<void>(`/crm/catalog/attributes/${attributeId}/options/reorder`, request);
  }

  // `setNodeSpecs()` — REMOVED (Run A, F2), not merely deprecated. `PUT /nodes/{id}/specs`
  // shipped at backend `3d400a7`, so its old "⛔ PENDING BACKEND — 404s" banner is stale
  // and would now be a lie. Rather than un-stub it, this run consolidates onto the v2
  // route: `setItemAttributeValues()` above is the one replace-all write for item
  // attribute values, not two competing ones. The admin Specs card's landing spot is
  // `setItemAttributeValues()`, keyed by the item's own id, not the v1 node id — Run B's
  // F6 wires it in alongside the rest of the admin item dialog.

  // ── Normalizers ────────────────────────────────────────────────────────

  private normalizeCategory(source: unknown): CatalogCategory {
    return {
      id: this.field<string>(source, 'id') ?? '',
      parentId: this.field<string | null>(source, 'parentId') ?? null,
      code: this.field<string>(source, 'code') ?? '',
      nameEn: this.field<string>(source, 'nameEn') ?? '',
      nameAr: this.field<string>(source, 'nameAr') ?? '',
      path: this.field<string>(source, 'path') ?? '',
      depth: this.field<number>(source, 'depth') ?? 0,
      selectionMode: this.field<number>(source, 'selectionMode') ?? CatalogSelectionMode.None,
      isRequired: this.field<boolean>(source, 'isRequired') ?? false,
      sortOrder: this.field<number>(source, 'sortOrder') ?? 0,
      isActive: this.field<boolean>(source, 'isActive') ?? true,
      trackKey: this.trackKeyFor(source, 'CatalogCategory.id', 'id'),
    };
  }

  private normalizeItem(source: unknown): CatalogItem {
    const attributes = this.field<unknown[]>(source, 'attributes') ?? [];
    return {
      id: this.field<string>(source, 'id') ?? '',
      categoryId: this.field<string>(source, 'categoryId') ?? '',
      code: this.field<string>(source, 'code') ?? '',
      nameEn: this.field<string>(source, 'nameEn') ?? '',
      nameAr: this.field<string>(source, 'nameAr') ?? '',
      descriptionEn: this.field<string | null>(source, 'descriptionEn') ?? null,
      descriptionAr: this.field<string | null>(source, 'descriptionAr') ?? null,
      imageUri: this.field<string | null>(source, 'imageUri') ?? null,
      isPurchasable: this.field<boolean>(source, 'isPurchasable') ?? true,
      sortOrder: this.field<number>(source, 'sortOrder') ?? 0,
      isActive: this.field<boolean>(source, 'isActive') ?? true,
      attributes: attributes.map((a) => this.normalizeItemAttributeValue(a)),
      trackKey: this.trackKeyFor(source, 'CatalogItem.id', 'id'),
    };
  }

  private normalizeItemAttributeValue(source: unknown): ItemAttributeValue {
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

  /** Root-to-parent breadcrumb — the only shape `categoryAncestors()` needs from the
   * still-node-shaped ancestors route. See that method's own doc comment. */
  private normalizeBreadcrumb(source: unknown): CatalogBreadcrumb {
    return {
      id: this.field<string>(source, 'id') ?? '',
      code: this.field<string>(source, 'code') ?? '',
      nameEn: this.field<string>(source, 'nameEn') ?? '',
      nameAr: this.field<string>(source, 'nameAr') ?? '',
    };
  }

  private normalizeAttribute(source: unknown): CatalogAttribute {
    const options = this.field<unknown[]>(source, 'options') ?? [];
    // The wire field is still `nodeId`, but since the v2 split it carries a CATEGORY id
    // (see the model's own doc comment on `CatalogAttribute.categoryId`).
    const categoryId =
      this.field<string>(source, 'categoryId') ?? this.field<string>(source, 'nodeId') ?? '';
    return {
      id: this.field<string>(source, 'id') ?? '',
      categoryId,
      code: this.field<string>(source, 'code') ?? '',
      nameEn: this.field<string>(source, 'nameEn') ?? '',
      nameAr: this.field<string>(source, 'nameAr') ?? '',
      dataType: this.field<number>(source, 'dataType') ?? CatalogAttributeType.Text,
      unit: this.field<string | null>(source, 'unit') ?? null,
      isRequired: this.field<boolean>(source, 'isRequired') ?? false,
      sortOrder: this.field<number>(source, 'sortOrder') ?? 0,
      isActive: this.field<boolean>(source, 'isActive') ?? true,
      options: options.map((o) => this.normalizeOption(o)),
    };
  }

  private normalizeOption(source: unknown): CatalogAttributeOption {
    return {
      id: this.field<string>(source, 'id') ?? '',
      code: this.field<string>(source, 'code') ?? '',
      nameEn: this.field<string>(source, 'nameEn') ?? '',
      nameAr: this.field<string>(source, 'nameAr') ?? '',
      imageUri: this.field<string | null>(source, 'imageUri') ?? null,
      sortOrder: this.field<number>(source, 'sortOrder') ?? 0,
      isActive: this.field<boolean>(source, 'isActive') ?? true,
    };
  }
}

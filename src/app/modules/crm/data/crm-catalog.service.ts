import { Injectable } from '@angular/core';
import { Observable, forkJoin } from 'rxjs';
import { map, switchMap } from 'rxjs/operators';
import { ApiService } from '@platform/http/api.service';
import { CatalogAttributeType, CatalogSelectionMode } from '../model/crm-enums';
import type {
  AddCatalogAttributeOptionRequest,
  AddCatalogAttributeRequest,
  CatalogAttribute,
  CatalogAttributeOption,
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

/**
 * Global catalog master data — `/api/crm/catalog/*`. Permission-gated but NOT
 * project-scoped: reads need `crm.catalog.read`, writes `crm.catalog.manage`.
 * Verified against `API/Endpoints/CrmCatalogEndpoints.cs` and
 * `API/Endpoints/CrmCatalogV2Endpoints.cs` at backend `3d400a7`.
 *
 * **009b (KNOWN-DELTA-3):** the modular backend maps only
 * `Crm.Infrastructure/Endpoints/CrmCatalogEndpoints.cs`. The `/nodes/*` alias described
 * below is gone; each method's own comment names the route it now calls.
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
 *
 * 009b #N-7: the mappings read, the ancestors read, the category search and the single-item
 * read have no route (C §2.11), so `getCategorySpaceTypes`/`categoryAncestors`/
 * `searchCategories`/`getItem` are gone; ancestors and search derive from `/tree`.
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
   * `GET /api/crm/catalog/categories/{categoryId}/attributes` — `crm.catalog.read`.
   * The category's OWN attributes only, ordered by `sortOrder`, with **no options** — no
   * route reads options (009b #36). {@link effectiveAttributes} adds the ancestors.
   */
  categoryAttributes(categoryId: string): Observable<CatalogAttribute[]> {
    return this.get<unknown>(`/crm/catalog/categories/${categoryId}/attributes`).pipe(
      map((r) => this.unwrapArray<unknown>(r).map((a) => this.normalizeAttribute(a))),
    );
  }

  // ── v2 category writes ─────────────────────────────────────────────────

  /**
   * `POST /api/crm/catalog/categories` → `201 { categoryId }` — `crm.catalog.manage` (009b #40).
   * `404 crm.catalog.CategoryNotFound` (parent), `400 MaxDepthExceeded` / `InvalidData`.
   */
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
    }).pipe(map((r) => this.unwrapId(r, 'categoryId')));
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
   * `400 crm.catalog.CyclicMove` (009b #40; was `CycleDetected`) / `crm.catalog.InactiveAncestor`,
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
   * `POST /api/crm/catalog/categories/{categoryId}/space-types/{spaceTypeId}`, **no body** →
   * `204` (not `201`, even though it's a POST) — `crm.catalog.manage`.
   * `409 crm.catalog.DuplicateMapping` (009b #37).
   */
  mapCategorySpaceType(categoryId: string, spaceTypeId: string): Observable<void> {
    return this.post<void>(
      `/crm/catalog/categories/${categoryId}/space-types/${spaceTypeId}`,
      null,
    );
  }

  /**
   * `DELETE /api/crm/catalog/categories/{categoryId}/space-types/{spaceTypeId}` → `204` —
   * `crm.catalog.manage`. Removing the LAST mapping makes the category global, not hidden.
   */
  unmapCategorySpaceType(categoryId: string, spaceTypeId: string): Observable<void> {
    return this.delete<void>(`/crm/catalog/categories/${categoryId}/space-types/${spaceTypeId}`);
  }

  /**
   * `GET /api/crm/catalog/categories/{categoryId}/items` — `crm.catalog.read` (009b #35).
   * The category's own items, inactive included, ordered by `sortOrder`; an unknown
   * category gives `[]`. No facets: the space-type/attribute/option feed is gone, and the
   * wire carries no attribute values, description or image (they normalise to `[]`/`null`).
   */
  itemsByCategory(categoryId: string): Observable<CatalogItem[]> {
    return this.get<unknown>(`/crm/catalog/categories/${categoryId}/items`).pipe(
      map((r) => this.unwrapArray<unknown>(r).map((i) => this.normalizeItem(i))),
    );
  }

  // ── v2 item writes ─────────────────────────────────────────────────────

  /**
   * `POST /api/crm/catalog/items` → `201 { itemId }` — `crm.catalog.manage` (009b #38).
   * `CreateCrmCatalogItemCommand` binds no description or image, so none is sent.
   */
  createItem(request: CreateCatalogItemRequest): Observable<string> {
    return this.post<unknown>('/crm/catalog/items', {
      categoryId: request.categoryId,
      code: request.code,
      nameEn: request.nameEn,
      nameAr: request.nameAr,
      isPurchasable: request.isPurchasable ?? true,
      sortOrder: request.sortOrder ?? 0,
    }).pipe(map((r) => this.unwrapId(r, 'itemId')));
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
   * Own + every ancestor's attribute definitions, ancestor-first (009b #36). The backend
   * serves only a category's OWN attributes (`GET /categories/{id}/attributes`) and the
   * `/nodes/*` alias is gone, so the chain is walked here: one `GET /tree`, then the own
   * route for each ancestor (root first) and the category itself. An id the tree does not
   * hold reads its own route alone. Options are always `[]` (no route reads them).
   */
  effectiveAttributes(categoryId: string): Observable<CatalogAttribute[]> {
    return this.getCategories(null, true).pipe(
      switchMap((tree) => {
        const byId = new Map(tree.map((c) => [c.id, c]));
        const chain = [categoryId];
        let cursor = byId.get(categoryId)?.parentId ?? null;
        while (cursor && !chain.includes(cursor)) {
          chain.unshift(cursor);
          cursor = byId.get(cursor)?.parentId ?? null;
        }
        return forkJoin(chain.map((id) => this.categoryAttributes(id)));
      }),
      map((lists) => lists.flat()),
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

  /**
   * `POST /api/crm/catalog/attributes` → `201 { attributeId }` — `crm.catalog.manage`
   * (009b #39). The declaring category travels in the body as `categoryId`. `404
   * crm.catalog.CategoryNotFound`, `400 crm.catalog.InvalidData`.
   */
  addAttribute(categoryId: string, request: AddCatalogAttributeRequest): Observable<string> {
    return this.post<unknown>('/crm/catalog/attributes', {
      categoryId,
      code: request.code,
      nameEn: request.nameEn,
      nameAr: request.nameAr,
      dataType: request.dataType,
      unit: request.unit ?? null,
      isRequired: request.isRequired ?? false,
      sortOrder: request.sortOrder ?? 0,
    }).pipe(map((r) => this.unwrapId(r, 'attributeId')));
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

  /** `POST /api/crm/catalog/attributes/{attributeId}/options` → `201 { optionId }` — `crm.catalog.manage` (009b #40). */
  addOption(attributeId: string, request: AddCatalogAttributeOptionRequest): Observable<string> {
    return this.post<unknown>(`/crm/catalog/attributes/${attributeId}/options`, {
      code: request.code,
      nameEn: request.nameEn,
      nameAr: request.nameAr,
      imageUri: request.imageUri ?? null,
      sortOrder: request.sortOrder ?? 0,
    }).pipe(map((r) => this.unwrapId(r, 'optionId')));
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

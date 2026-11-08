import { Injectable } from '@angular/core';
import { Observable, forkJoin } from 'rxjs';
import { map, switchMap } from 'rxjs/operators';
import { ApiService } from '@platform/http/api.service';
import { handled } from '@platform/http/handled-errors';
import { CatalogAttributeType, CatalogSelectionMode } from '../model/crm-enums';
import type {
  AddCatalogAttributeOptionRequest,
  AddCatalogAttributeRequest,
  CatalogAttribute,
  CatalogAttributeOption,
  CatalogCategory,
  CatalogItem,
  CreateCatalogCategoryRequest,
  CreateCatalogItemRequest,
  ItemAttributeValue,
  ItemAttributeValueRequest,
  MoveCatalogCategoryRequest,
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
 * 009b #N-8: nor is there a category update, reorder, activate, clone, delete or unmap
 * route; only create, move and map remain. 009b #N-9: nor an item update, move, activate
 * or delete; items are created and their attribute values written. 009b #N-10: nor an
 * attribute or option update, delete or reorder; attributes and options are added only.
 */
/** The `{kind}` segment of the catalog admin routes (`CrmCatalogEndpoints.cs:107-129`). */
export type CatalogEntryKind = 'categories' | 'items' | 'attributes' | 'options';

/**
 * `CatalogEntryRequest` (`CrmCatalogEndpoints.cs:153`). `code`/`nameEn`/`nameAr` are required
 * for every kind; every other member is optional and a member left out keeps its value
 * (`UpdateCrmCatalogEntryCommandHandler`). Which ones a kind reads: categories
 * `selectionMode`/`isRequired`/descriptions/`imageUri`; items `isPurchasable`/descriptions/
 * `imageUri`; attributes `unit`/`isRequired`; options `imageUri`.
 */
export interface CatalogEntryUpdate {
  code: string;
  nameEn: string;
  nameAr: string;
  selectionMode?: CatalogSelectionMode;
  isRequired?: boolean;
  isPurchasable?: boolean;
  unit?: string | null;
  descriptionEn?: string | null;
  descriptionAr?: string | null;
  imageUri?: string | null;
}

/**
 * crmp C-4 (D4): the catalog admin writes — edit (#117), activate/deactivate (#118), delete
 * (#119, 409 `crm.catalog.InUse` → deactivate instead), the options read with
 * `includeInactive` (#115), map/unmap a space type (#61/#116) and the `tree?spaceTypeId`
 * picker. The 009b #N-8..#N-10 "no route" notes below are superseded by these.
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

  /**
   * `GET /api/crm/catalog/tree?spaceTypeId=` — `crm.catalog.read` (`CrmCatalogEndpoints.cs:83`).
   * The picker view: active categories targeted to the space type directly or through an
   * ancestor, inactive subtrees hidden (`GetCrmCatalogTreeQueryHandler`).
   */
  treeForSpaceType(spaceTypeId: string): Observable<CatalogCategory[]> {
    return this.get<unknown>('/crm/catalog/tree', { spaceTypeId }).pipe(
      map((r) => this.unwrapArray<unknown>(r).map((c) => this.normalizeCategory(c))),
    );
  }

  /**
   * `GET /api/crm/catalog/attributes/{attributeId}/options?includeInactive=` — `crm.catalog.read`
   * (`CrmCatalogEndpoints.cs:91`, #115). Ordered by `sortOrder` then code.
   */
  attributeOptions(
    attributeId: string,
    includeInactive = false,
  ): Observable<CatalogAttributeOption[]> {
    return this.get<unknown>(`/crm/catalog/attributes/${attributeId}/options`, {
      includeInactive: String(includeInactive),
    }).pipe(map((r) => this.unwrapArray<unknown>(r).map((o) => this.normalizeOption(o))));
  }

  /**
   * `PUT /api/crm/catalog/{kind}/{id}` → `204` — `crm.catalog.manage` (`CrmCatalogEndpoints.cs:107`,
   * #117). Only the members given are sent. 409 `crm.catalog.CodeTaken` and 404
   * `crm.catalog.EntryNotFound` are shown by the caller.
   */
  updateEntry(kind: CatalogEntryKind, id: string, request: CatalogEntryUpdate): Observable<void> {
    const body: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(request)) {
      if (value !== undefined) body[key] = value;
    }
    return this.put<void>(`/crm/catalog/${kind}/${id}`, body, { context: handled(404, 409) });
  }

  /** `PUT /api/crm/catalog/{kind}/{id}/active` `{ isActive }` → `204` (`CrmCatalogEndpoints.cs:117`, #118). */
  setEntryActive(kind: CatalogEntryKind, id: string, isActive: boolean): Observable<void> {
    return this.put<void>(
      `/crm/catalog/${kind}/${id}/active`,
      { isActive },
      { context: handled(404, 409) },
    );
  }

  /**
   * `DELETE /api/crm/catalog/{kind}/{id}` → `204` (`CrmCatalogEndpoints.cs:124`, #119). 409
   * `crm.catalog.InUse` when something references the entry — the caller offers deactivate.
   */
  deleteEntry(kind: CatalogEntryKind, id: string): Observable<void> {
    return this.delete<void>(`/crm/catalog/${kind}/${id}`, undefined, {
      context: handled(404, 409),
    });
  }

  /**
   * `DELETE /api/crm/catalog/categories/{categoryId}/space-types/{spaceTypeId}` → `204`
   * (`CrmCatalogEndpoints.cs:100`, #116). 404 `crm.catalog.MappingNotFound` when the category is
   * not targeted to that type.
   */
  unmapCategorySpaceType(categoryId: string, spaceTypeId: string): Observable<void> {
    return this.delete<void>(
      `/crm/catalog/categories/${categoryId}/space-types/${spaceTypeId}`,
      undefined,
      { context: handled(404) },
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

  /**
   * `POST /api/crm/catalog/categories/{categoryId}/space-types/{spaceTypeId}`, **no body** →
   * `204` (not `201`, even though it's a POST) — `crm.catalog.manage`.
   * `409 crm.catalog.DuplicateMapping` (009b #37), shown by the caller.
   */
  mapCategorySpaceType(categoryId: string, spaceTypeId: string): Observable<void> {
    return this.post<void>(
      `/crm/catalog/categories/${categoryId}/space-types/${spaceTypeId}`,
      null,
      { context: handled(404, 409) },
    );
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
      // Sync S9: the category response now carries its description and image (null when unset).
      descriptionEn: this.field<string | null>(source, 'descriptionEn') ?? null,
      descriptionAr: this.field<string | null>(source, 'descriptionAr') ?? null,
      imageUri: this.field<string | null>(source, 'imageUri') ?? null,
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

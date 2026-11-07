import { Injectable } from '@angular/core';
import { Observable, map } from 'rxjs';
import { ApiService } from '@platform/http/api.service';
import { handled } from '@platform/http/handled-errors';
import {
  normalizeItem,
  normalizeModule,
  normalizeSchema,
  normalizeUsage,
} from '../model/site-normalize';
import type {
  AttachSiteItemRequest,
  ChangeSiteItemShapeRequest,
  CreateSiteItemRequest,
  CreateSiteModuleRequest,
  SiteItem,
  SiteItemOptionRequest,
  SiteItemUsage,
  SiteLinkOrder,
  SiteModule,
  SiteModuleSchema,
  UpdateSiteItemOptionRequest,
  UpdateSiteItemRequest,
  UpdateSiteLinkRequest,
  UpdateSiteModuleRequest,
} from '../model/site-definition.model';

/**
 * sites S-1: the definition routes D1–D20 (dms `Sites.Infrastructure/Endpoints/SiteDefinitionEndpoints.cs`).
 * The `active` routes take `?isActive=` and no body. Note the option asymmetry (`:143-145`): add under
 * `/{itemId}/options`, edit under `/options/{optionId}`.
 */
@Injectable({ providedIn: 'root' })
export class SiteDefinitionService extends ApiService {
  private static readonly WRITE = () => handled(400, 404, 409);

  /** D1 `GET /api/site-modules?includeInactive` (`:31-40`). */
  modules(includeInactive = false): Observable<SiteModule[]> {
    return this.get<unknown>('/site-modules', { includeInactive: includeInactive || null }).pipe(
      map((r) => this.unwrapArray<unknown>(r).map(normalizeModule)),
    );
  }

  /** D2 `GET /api/site-modules/{code}/schema` (`:43-50`): 404 on an unknown or inactive module. */
  schema(code: string): Observable<SiteModuleSchema> {
    return this.get<unknown>(`/site-modules/${encodeURIComponent(code)}/schema`, undefined, {
      context: handled(404),
    }).pipe(map(normalizeSchema));
  }

  /** D3 `POST /api/site-modules` (`:52-60`) → 201 `{ moduleId }`. */
  createModule(req: CreateSiteModuleRequest): Observable<string> {
    return this.post<unknown>(
      '/site-modules',
      {
        code: req.code,
        nameEn: req.nameEn,
        nameAr: req.nameAr,
        descriptionEn: req.descriptionEn ?? null,
        descriptionAr: req.descriptionAr ?? null,
        sortOrder: req.sortOrder ?? 0,
      },
      { context: SiteDefinitionService.WRITE() },
    ).pipe(map((r) => this.unwrapId(r, 'moduleId')));
  }

  /** D4 `PUT /api/site-modules/{moduleId}` (`:62-68`). */
  updateModule(moduleId: string, req: UpdateSiteModuleRequest): Observable<void> {
    return this.put<void>(`/site-modules/${moduleId}`, req, {
      context: SiteDefinitionService.WRITE(),
    });
  }

  /** D5 `DELETE /api/site-modules/{moduleId}` (`:70-75`). */
  deleteModule(moduleId: string): Observable<void> {
    return this.delete<void>(`/site-modules/${moduleId}`, undefined, {
      context: SiteDefinitionService.WRITE(),
    });
  }

  /** D6 `PUT /api/site-modules/{moduleId}/active?isActive` (`:77-83`), no body. */
  setModuleActive(moduleId: string, isActive: boolean): Observable<void> {
    return this.put<void>(`/site-modules/${moduleId}/active?isActive=${isActive}`, null, {
      context: SiteDefinitionService.WRITE(),
    });
  }

  /** D7 `POST /api/site-modules/{moduleId}/items` (`:87-95`) → 201 `{ linkId }`. */
  attachItem(moduleId: string, req: AttachSiteItemRequest): Observable<string> {
    return this.post<unknown>(
      `/site-modules/${moduleId}/items`,
      {
        itemId: req.itemId,
        isRequired: req.isRequired ?? false,
        isVisible: req.isVisible ?? true,
        sortOrder: req.sortOrder ?? 0,
      },
      { context: SiteDefinitionService.WRITE() },
    ).pipe(map((r) => this.unwrapId(r, 'linkId')));
  }

  /** D8 `PUT /api/site-modules/{moduleId}/items/reorder` `{ order }` (`:97-103`). */
  reorderItems(moduleId: string, order: SiteLinkOrder[]): Observable<void> {
    return this.put<void>(
      `/site-modules/${moduleId}/items/reorder`,
      { order },
      { context: SiteDefinitionService.WRITE() },
    );
  }

  /** D9 `PUT /api/site-modules/{moduleId}/items/{itemId}` (`:105-111`): all three link fields. */
  updateLink(moduleId: string, itemId: string, req: UpdateSiteLinkRequest): Observable<void> {
    return this.put<void>(
      `/site-modules/${moduleId}/items/${itemId}`,
      { isRequired: req.isRequired, isVisible: req.isVisible, sortOrder: req.sortOrder },
      { context: SiteDefinitionService.WRITE() },
    );
  }

  /** D10 `DELETE /api/site-modules/{moduleId}/items/{itemId}` (`:113-119`): detach; values kept. */
  detachItem(moduleId: string, itemId: string): Observable<void> {
    return this.delete<void>(`/site-modules/${moduleId}/items/${itemId}`, undefined, {
      context: SiteDefinitionService.WRITE(),
    });
  }

  /** D11 `GET /api/site-items?includeInactive` (`:125-132`). */
  items(includeInactive = false): Observable<SiteItem[]> {
    return this.get<unknown>('/site-items', { includeInactive: includeInactive || null }).pipe(
      map((r) => this.unwrapArray<unknown>(r).map(normalizeItem)),
    );
  }

  /** D12 `POST /api/site-items` (`:134-140`) → 201 `{ itemId }`. */
  createItem(req: CreateSiteItemRequest): Observable<string> {
    return this.post<unknown>(
      '/site-items',
      {
        code: req.code,
        nameEn: req.nameEn,
        nameAr: req.nameAr,
        dataType: req.dataType,
        unit: req.unit ?? null,
        minValue: req.minValue ?? null,
        maxValue: req.maxValue ?? null,
        tolerance: req.tolerance ?? 0,
        maxLength: req.maxLength ?? null,
        regexPattern: req.regexPattern ?? null,
      },
      { context: SiteDefinitionService.WRITE() },
    ).pipe(map((r) => this.unwrapId(r, 'itemId')));
  }

  /** D13 `PUT /api/site-items/options/{optionId}` (`:146-152`). */
  updateOption(optionId: string, req: UpdateSiteItemOptionRequest): Observable<void> {
    return this.put<void>(`/site-items/options/${optionId}`, req, {
      context: SiteDefinitionService.WRITE(),
    });
  }

  /** D14 `PUT /api/site-items/options/{optionId}/active?isActive` (`:154-162`), no body. */
  setOptionActive(optionId: string, isActive: boolean): Observable<void> {
    return this.put<void>(`/site-items/options/${optionId}/active?isActive=${isActive}`, null, {
      context: SiteDefinitionService.WRITE(),
    });
  }

  /** D15 `GET /api/site-items/{itemId}/usage` (`:164-170`). */
  usage(itemId: string): Observable<SiteItemUsage> {
    return this.get<unknown>(`/site-items/${itemId}/usage`, undefined, {
      context: handled(404),
    }).pipe(map(normalizeUsage));
  }

  /** D16 `PUT /api/site-items/{itemId}` (`:172-178`). */
  updateItem(itemId: string, req: UpdateSiteItemRequest): Observable<void> {
    return this.put<void>(`/site-items/${itemId}`, req, {
      context: SiteDefinitionService.WRITE(),
    });
  }

  /** D17 `PUT /api/site-items/{itemId}/shape` (`:180-186`). */
  changeShape(itemId: string, req: ChangeSiteItemShapeRequest): Observable<void> {
    return this.put<void>(`/site-items/${itemId}/shape`, req, {
      context: SiteDefinitionService.WRITE(),
    });
  }

  /** D18 `DELETE /api/site-items/{itemId}` (`:188-193`). */
  deleteItem(itemId: string): Observable<void> {
    return this.delete<void>(`/site-items/${itemId}`, undefined, {
      context: SiteDefinitionService.WRITE(),
    });
  }

  /** D19 `PUT /api/site-items/{itemId}/active?isActive` (`:195-201`), no body. */
  setItemActive(itemId: string, isActive: boolean): Observable<void> {
    return this.put<void>(`/site-items/${itemId}/active?isActive=${isActive}`, null, {
      context: SiteDefinitionService.WRITE(),
    });
  }

  /** D20 `POST /api/site-items/{itemId}/options` (`:203-211`) → 201 `{ optionId }`. */
  addOption(itemId: string, req: SiteItemOptionRequest): Observable<string> {
    return this.post<unknown>(
      `/site-items/${itemId}/options`,
      { code: req.code, nameEn: req.nameEn, nameAr: req.nameAr, sortOrder: req.sortOrder ?? 0 },
      { context: SiteDefinitionService.WRITE() },
    ).pipe(map((r) => this.unwrapId(r, 'optionId')));
  }
}

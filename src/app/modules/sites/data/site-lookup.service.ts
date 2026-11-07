import { Injectable } from '@angular/core';
import { Observable, catchError, forkJoin, map, of, shareReplay, switchMap } from 'rxjs';
import { ApiService, readField } from '@platform/http/api.service';
import { handled } from '@platform/http/handled-errors';

/** A CRM space as the capture grid needs it (`CrmSpaceResponse`, `SpaceContracts.cs:8-9`). */
export interface SiteSpaceOption {
  id: string;
  name: string;
  sortOrder: number;
  isActive: boolean;
}

/** A catalog category or item as the capture grid needs it (`CatalogContracts.cs:5-11`). */
export interface SiteCatalogEntry {
  id: string;
  categoryId: string | null;
  nameEn: string;
  nameAr: string;
  sortOrder: number;
  isActive: boolean;
}

const s = (o: unknown, k: string) => {
  const v = readField<unknown>(o, k);
  return typeof v === 'string' ? v : '';
};
const n = (o: unknown, k: string) => Number(readField<unknown>(o, k) ?? 0) || 0;
const b = (o: unknown, k: string) => readField<unknown>(o, k) !== false;

/**
 * sites S-5 / A1 (DEVIATION-18): the cross-module lookups the survey screens degrade on. Each read is
 * marked `handled(403)` (and 404 for the employee) so a caller without `crm.spaces.read`,
 * `crm.catalog.read` or `employees.read` (BF-1) gets the fallback, not a global toast. They are read
 * here, not through `CrmSpaceService` / `CrmCatalogService` / `EmployeeService`, because those take no
 * HttpContext (and the space list forks a `/crm/space-types` read that would toast its own 403).
 */
@Injectable({ providedIn: 'root' })
export class SiteLookupService extends ApiService {
  private catalogTree$: Observable<SiteCatalogEntry[]> | null = null;
  private readonly itemsByCategory = new Map<string, Observable<SiteCatalogEntry[]>>();
  private readonly names = new Map<string, Observable<string | null>>();

  /** `GET /api/crm/projects/{projectId}/spaces` (`CrmSpaceEndpoints.cs:48`, `crm.spaces.read`); active only. */
  spaces(projectId: string): Observable<SiteSpaceOption[]> {
    return this.get<unknown>(`/crm/projects/${projectId}/spaces`, undefined, {
      context: handled(403, 404),
    }).pipe(
      map((r) =>
        this.unwrapArray<unknown>(r)
          .map((x) => ({
            id: s(x, 'id'),
            name: s(x, 'name'),
            sortOrder: n(x, 'sortOrder'),
            isActive: b(x, 'isActive'),
          }))
          .filter((x) => x.isActive)
          .sort((a, c) => a.sortOrder - c.sortOrder),
      ),
    );
  }

  /** `GET /api/crm/catalog/tree` (`CrmCatalogEndpoints.cs:83`, `crm.catalog.read`); active categories. */
  catalogCategories(): Observable<SiteCatalogEntry[]> {
    this.catalogTree$ ??= this.get<unknown>('/crm/catalog/tree', undefined, {
      context: handled(403),
    }).pipe(
      map((r) =>
        this.unwrapArray<unknown>(r)
          .map((x) => this.entry(x, readField<string>(x, 'parentId') ?? null))
          .filter((x) => x.isActive),
      ),
      shareReplay(1),
    );
    return this.catalogTree$;
  }

  /** `GET /api/crm/catalog/categories/{id}/items` (`CrmCatalogEndpoints.cs:131`); active items. */
  catalogItems(categoryId: string): Observable<SiteCatalogEntry[]> {
    let cached = this.itemsByCategory.get(categoryId);
    if (!cached) {
      cached = this.get<unknown>(`/crm/catalog/categories/${categoryId}/items`, undefined, {
        context: handled(403, 404),
      }).pipe(
        map((r) =>
          this.unwrapArray<unknown>(r)
            .map((x) => this.entry(x, s(x, 'categoryId') || categoryId))
            .sort((a, c) => a.sortOrder - c.sortOrder),
        ),
        shareReplay(1),
      );
      this.itemsByCategory.set(categoryId, cached);
    }
    return cached;
  }

  /**
   * Every catalog item of every category (no single-item route exists), to name the items stored on
   * records. Only called when a grid holds a catalog item.
   */
  allCatalogItems(): Observable<SiteCatalogEntry[]> {
    return this.catalogCategories().pipe(
      switchMap((cats) =>
        cats.length ? forkJoin(cats.map((c) => this.catalogItems(c.id))) : of([]),
      ),
      map((lists) => lists.flat()),
    );
  }

  /** `GET /api/employees/{id}` (`employees.read`) → the display name; null on 403/404. */
  employeeName(id: string): Observable<string | null> {
    let cached = this.names.get(id);
    if (!cached) {
      cached = this.get<unknown>(`/employees/${id}`, undefined, {
        context: handled(403, 404),
      }).pipe(
        map((r) => s(this.unwrap(r), 'fullName') || null),
        catchError(() => of(null)),
        shareReplay(1),
      );
      this.names.set(id, cached);
    }
    return cached;
  }

  private entry(x: unknown, categoryId: string | null): SiteCatalogEntry {
    return {
      id: s(x, 'id'),
      categoryId,
      nameEn: s(x, 'nameEn'),
      nameAr: s(x, 'nameAr'),
      sortOrder: n(x, 'sortOrder'),
      isActive: b(x, 'isActive'),
    };
  }
}

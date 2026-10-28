import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { of, throwError } from 'rxjs';
import { CrmCatalogService } from '../data/crm-catalog.service';
import { CatalogSelectionMode } from '../model/crm-enums';
import type { CatalogCategory, CatalogItem } from '../model';
import { CATALOG_TTL_MS, CatalogStore } from './catalog.store';

function category(id: string, over: Partial<CatalogCategory> = {}): CatalogCategory {
  return {
    id,
    parentId: null,
    code: id,
    nameEn: id,
    nameAr: id,
    path: `/${id}/`,
    depth: 0,
    selectionMode: CatalogSelectionMode.None,
    isRequired: false,
    sortOrder: 0,
    isActive: true,
    trackKey: id,
    ...over,
  };
}

const CAT_FURNITURE = category('furniture');
// A real materialized path, nested under `furniture` — `categorySubtreeIds` matches on
// `path.startsWith()`, which the default `/${id}/` path from `category()` would not satisfy.
const CAT_SEATING = category('seating', { parentId: 'furniture', path: '/furniture/seating/' });
const CAT_TREE = [CAT_FURNITURE, CAT_SEATING];

function catalogItem(id: string, categoryId: string): CatalogItem {
  return {
    id,
    categoryId,
    code: id,
    nameEn: id,
    nameAr: id,
    descriptionEn: null,
    descriptionAr: null,
    imageUri: null,
    isPurchasable: true,
    sortOrder: 0,
    isActive: true,
    attributes: [],
    trackKey: id,
  };
}

function apiMock() {
  return {
    effectiveAttributes: vi.fn().mockReturnValue(of([])),
    getCategories: vi.fn().mockReturnValue(of(CAT_TREE)),
    itemsByCategory: vi.fn().mockReturnValue(of([catalogItem('sofa-1', 'seating')])),
  };
}

describe('CatalogStore', () => {
  let api: ReturnType<typeof apiMock>;

  beforeEach(() => {
    api = apiMock();
    TestBed.configureTestingModule({
      providers: [{ provide: CrmCatalogService, useValue: api }],
    });
  });

  const store = () => TestBed.inject(CatalogStore);
  const t0 = 1_000_000;

  describe('categorySubtreeIds — the move cycle guard', () => {
    it('includes the category itself and every descendant', () => {
      const s = store();
      s.loadCategories(t0);
      expect([...s.categorySubtreeIds('furniture')].sort()).toEqual(['furniture', 'seating']);
    });

    it('returns just the id when the category is unknown', () => {
      const s = store();
      expect([...s.categorySubtreeIds('ghost')]).toEqual(['ghost']);
    });

    it('a leaf is its own whole subtree', () => {
      const s = store();
      s.loadCategories(t0);
      expect([...s.categorySubtreeIds('seating')]).toEqual(['seating']);
    });
  });

  describe('v2 categories — one whole-tree fetch, TTL via explicit nowMs', () => {
    it('does not refetch inside the TTL and refetches once it lapses', () => {
      const s = store();
      s.loadCategories(t0);
      s.loadCategories(t0 + CATALOG_TTL_MS - 1);
      expect(api.getCategories).toHaveBeenCalledTimes(1);

      s.loadCategories(t0 + CATALOG_TTL_MS + 1);
      expect(api.getCategories).toHaveBeenCalledTimes(2);
    });

    it('categoryRoots holds only parentId-null rows', () => {
      const s = store();
      s.loadCategories(t0);
      expect(s.categoryRoots().map((c) => c.id)).toEqual(['furniture']);
    });

    it('categoryChildrenOf returns direct children only', () => {
      const s = store();
      s.loadCategories(t0);
      expect(s.categoryChildrenOf('furniture').map((c) => c.id)).toEqual(['seating']);
      expect(s.categoryChildrenOf(null).map((c) => c.id)).toEqual(['furniture']);
    });

    it('categoryAncestorsOf walks parentId root-first', () => {
      const s = store();
      s.loadCategories(t0);
      expect(s.categoryAncestorsOf('seating').map((c) => c.id)).toEqual(['furniture']);
      expect(s.categoryAncestorsOf('furniture')).toEqual([]);
    });

    it('patches a translated key on failure', () => {
      api.getCategories.mockReturnValue(throwError(() => new Error('boom')));
      const s = store();
      s.loadCategories(t0);
      expect(s.error()).toBe('cat.loadFailed');
      expect(s.treeLoading()).toBe(false);
    });

    it('invalidate() clears the category cache', () => {
      const s = store();
      s.loadCategories(t0);
      s.invalidate();
      s.loadCategories(t0);
      expect(api.getCategories).toHaveBeenCalledTimes(2);
    });
  });

  describe('v2 items — per-category, on demand (unlike categories, unbounded)', () => {
    it('fetches by categoryId and caches under that key', () => {
      const s = store();
      s.loadItemsForCategory('seating', t0);
      expect(api.itemsByCategory).toHaveBeenCalledWith('seating');
      expect(s.itemsForCategory('seating')?.map((i) => i.id)).toEqual(['sofa-1']);
    });

    it('is undefined for a category never loaded — not an empty array', () => {
      const s = store();
      expect(s.itemsForCategory('seating')).toBeUndefined();
    });

    it('does not refetch inside the TTL for the same category', () => {
      const s = store();
      s.loadItemsForCategory('seating', t0);
      s.loadItemsForCategory('seating', t0 + CATALOG_TTL_MS - 1);
      expect(api.itemsByCategory).toHaveBeenCalledTimes(1);
    });

    it('`force` refetches even inside the TTL', () => {
      const s = store();
      s.loadItemsForCategory('seating', t0);
      s.loadItemsForCategory('seating', t0, true);
      expect(api.itemsByCategory).toHaveBeenCalledTimes(2);
    });
  });

  // 009b #35: the only item read is GET /categories/{id}/items — no space-type, attribute
  // or option facet. The storefront's per-space-type pool is "not available"; the fetch,
  // TTL and force cases went with the route.
  describe('v2 items — the storefront pool is not available (009b #35)', () => {
    it('issues no request and reports cat.notAvailable', () => {
      const s = store();
      s.loadItemsForSpaceType('st-1', t0);
      expect(api.itemsByCategory).not.toHaveBeenCalled();
      expect(s.itemsForSpaceType('st-1')).toBeUndefined();
      expect(s.poolError()).toBe('cat.notAvailable');
      expect(s.poolLoading()).toBe(false);
      expect(s.treeLoading()).toBe(false);
    });
  });
});

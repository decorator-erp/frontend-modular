import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { of, throwError } from 'rxjs';
import { CrmCatalogService } from '../data/crm-catalog.service';
import { CatalogSelectionMode } from '../model/crm-enums';
import type { CatalogCategory } from '../model';
import { CatalogAdminStore } from './catalog-admin.store';
import { CatalogStore } from './catalog.store';

/**
 * No spec existed for this store before Run B (Run A's own audit recorded the gap). F6
 * rewrote it end to end for v2 categories, so this covers what's genuinely new: the
 * category-CRUD delegation to the v2 service methods, the targeting card's read+write
 * (space types didn't exist as a read before this run), and `reorderChild`'s deliberately
 * NON-optimistic reorder (unlike the v1 admin's, which patched `CatalogStore.setNodes`
 * ahead of the response — there is no `setCategories` equivalent, so this waits for the
 * server and refetches, documented in the method's own comment).
 */
function category(id: string, over: Partial<CatalogCategory> = {}): CatalogCategory {
  return {
    id,
    parentId: null,
    code: id,
    nameEn: id,
    nameAr: id,
    descriptionEn: null,
    descriptionAr: null,
    imageUri: null,
    path: `/${id}/`,
    depth: 0,
    selectionMode: CatalogSelectionMode.None,
    isRequired: false,
    sortOrder: 0,
    isActive: true,
    spaceTypeIds: [],
    trackKey: id,
    ...over,
  };
}

function apiMock() {
  return {
    getCategories: vi.fn().mockReturnValue(of([])),
    getCategorySpaceTypes: vi.fn().mockReturnValue(of([])),
    searchCategories: vi.fn().mockReturnValue(of([])),
    createCategory: vi.fn().mockReturnValue(of('new-id')),
    updateCategory: vi.fn().mockReturnValue(of(undefined)),
    setCategoryActive: vi.fn().mockReturnValue(of(undefined)),
    moveCategory: vi.fn().mockReturnValue(of(undefined)),
    cloneCategory: vi.fn().mockReturnValue(of('cloned-id')),
    deleteCategory: vi.fn().mockReturnValue(of(undefined)),
    reorderCategories: vi.fn().mockReturnValue(of(undefined)),
    mapCategorySpaceType: vi.fn().mockReturnValue(of(undefined)),
    unmapCategorySpaceType: vi.fn().mockReturnValue(of(undefined)),
    setItemActive: vi.fn().mockReturnValue(of(undefined)),
    deleteItem: vi.fn().mockReturnValue(of(undefined)),
    effectiveAttributes: vi.fn().mockReturnValue(of([])),
    getItems: vi.fn().mockReturnValue(of([])),
    addAttribute: vi.fn().mockReturnValue(of('attr-id')),
    updateAttribute: vi.fn().mockReturnValue(of(undefined)),
    deleteAttribute: vi.fn().mockReturnValue(of(undefined)),
    addOption: vi.fn().mockReturnValue(of('opt-id')),
    updateOption: vi.fn().mockReturnValue(of(undefined)),
    deleteOption: vi.fn().mockReturnValue(of(undefined)),
    reorderOptions: vi.fn().mockReturnValue(of(undefined)),
  };
}

describe('CatalogAdminStore', () => {
  let api: ReturnType<typeof apiMock>;

  beforeEach(() => {
    api = apiMock();
    TestBed.configureTestingModule({
      providers: [CatalogStore, CatalogAdminStore, { provide: CrmCatalogService, useValue: api }],
    });
  });

  const store = () => TestBed.inject(CatalogAdminStore);

  describe('selectCategory() — space-type targeting is now read + write', () => {
    it('fetches the category own mappings when a category is selected', () => {
      api.getCategorySpaceTypes.mockReturnValue(of(['st-1', 'st-2']));
      const s = store();
      s.selectCategory('cat-1');

      expect(api.getCategorySpaceTypes).toHaveBeenCalledWith('cat-1');
      expect(s.spaceTypeIds()).toEqual(['st-1', 'st-2']);
      expect(s.spaceTypesLoading()).toBe(false);
    });

    it('clears spaceTypeIds and issues no request when selecting the root (null)', () => {
      const s = store();
      s.selectCategory(null);

      expect(api.getCategorySpaceTypes).not.toHaveBeenCalled();
      expect(s.spaceTypeIds()).toEqual([]);
    });

    it('mapSpaceType reloads the mappings on success, not the whole cache alone', () => {
      api.getCategorySpaceTypes
        .mockReturnValueOnce(of([])) // initial selectCategory load
        .mockReturnValueOnce(of(['st-1'])); // reload after map
      const s = store();
      s.selectCategory('cat-1');

      s.mapSpaceType('cat-1', 'st-1');

      expect(api.mapCategorySpaceType).toHaveBeenCalledWith('cat-1', 'st-1');
      expect(api.getCategorySpaceTypes).toHaveBeenCalledTimes(2);
      expect(s.spaceTypeIds()).toEqual(['st-1']);
    });

    it('unmapSpaceType reloads the mappings on success', () => {
      api.getCategorySpaceTypes.mockReturnValueOnce(of(['st-1'])).mockReturnValueOnce(of([]));
      const s = store();
      s.selectCategory('cat-1');

      s.unmapSpaceType('cat-1', 'st-1');

      expect(api.unmapCategorySpaceType).toHaveBeenCalledWith('cat-1', 'st-1');
      expect(s.spaceTypeIds()).toEqual([]);
    });
  });

  describe('category CRUD delegates to the v2 service methods', () => {
    it('createCategory() calls api.createCategory', () => {
      const s = store();
      const onDone = vi.fn();
      s.createCategory({ code: 'lighting', nameEn: 'Lighting', nameAr: 'إضاءة' }, { onDone });
      expect(api.createCategory).toHaveBeenCalledWith({
        code: 'lighting',
        nameEn: 'Lighting',
        nameAr: 'إضاءة',
      });
      expect(onDone).toHaveBeenCalledOnce();
    });

    it('deleteCategory() selects the parent and refreshes on success', () => {
      const s = store();
      s.selectCategory('cat-1');
      const onDone = vi.fn();

      s.deleteCategory('cat-1', 'parent-1', { onDone });

      expect(api.deleteCategory).toHaveBeenCalledWith('cat-1');
      expect(onDone).toHaveBeenCalledOnce();
      // Reselecting the parent triggers its own space-types fetch.
      expect(api.getCategorySpaceTypes).toHaveBeenCalledWith('parent-1');
    });

    it('deleteCategory() surfaces cat.nodeInUse on failure', () => {
      api.deleteCategory.mockReturnValue(throwError(() => new Error('409 crm.catalog.NodeInUse')));
      const s = store();
      s.deleteCategory('cat-1', null, {});
      expect(s.error()).toBe('cat.nodeInUse');
    });
  });

  describe('reorderChild() — NOT optimistic, unlike the v1 admin', () => {
    it('waits for the server response before refreshing — no local patch beforehand', () => {
      const cats = [category('a'), category('b'), category('c')];
      api.getCategories.mockReturnValue(of(cats));
      const s = store();
      const cache = TestBed.inject(CatalogStore);
      cache.loadCategories();

      s.reorderChild(null, 'b', -1);

      // Sends the swapped order to the server.
      expect(api.reorderCategories).toHaveBeenCalledWith(null, {
        items: [
          { id: 'b', sortOrder: 0 },
          { id: 'a', sortOrder: 1 },
          { id: 'c', sortOrder: 2 },
        ],
      });
    });

    it('reports cat.reorderFailed on failure and does not throw', () => {
      const cats = [category('a'), category('b')];
      api.getCategories.mockReturnValue(of(cats));
      api.reorderCategories.mockReturnValue(throwError(() => new Error('boom')));
      const s = store();
      const cache = TestBed.inject(CatalogStore);
      cache.loadCategories();

      s.reorderChild(null, 'a', 1);

      expect(s.error()).toBe('cat.reorderFailed');
    });

    it('is a no-op past either end of the sibling list', () => {
      const cats = [category('a'), category('b')];
      api.getCategories.mockReturnValue(of(cats));
      const s = store();
      const cache = TestBed.inject(CatalogStore);
      cache.loadCategories();

      s.reorderChild(null, 'a', -1); // already first
      s.reorderChild(null, 'b', 1); // already last

      expect(api.reorderCategories).not.toHaveBeenCalled();
    });
  });
});

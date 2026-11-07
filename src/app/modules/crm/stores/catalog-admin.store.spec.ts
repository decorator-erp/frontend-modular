import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { of, throwError } from 'rxjs';
import { HttpErrorResponse } from '@angular/common/http';
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

function apiMock() {
  return {
    getCategories: vi.fn().mockReturnValue(of([])),
    createCategory: vi.fn().mockReturnValue(of('new-id')),
    moveCategory: vi.fn().mockReturnValue(of(undefined)),
    mapCategorySpaceType: vi.fn().mockReturnValue(of(undefined)),
    effectiveAttributes: vi.fn().mockReturnValue(of([])),
    itemsByCategory: vi.fn().mockReturnValue(of([])),
    addAttribute: vi.fn().mockReturnValue(of('attr-id')),
    addOption: vi.fn().mockReturnValue(of('opt-id')),
    setEntryActive: vi.fn().mockReturnValue(of(undefined)),
    deleteEntry: vi.fn().mockReturnValue(of(undefined)),
    attributeOptions: vi.fn().mockReturnValue(of([])),
    unmapCategorySpaceType: vi.fn().mockReturnValue(of(undefined)),
    treeForSpaceType: vi.fn().mockReturnValue(of([])),
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

  // 009b #N-7: no route reads a category's mappings or searches categories (C §2.11).
  describe('selectCategory() and search() read no unmapped route (009b #N-7)', () => {
    it('selects a category without a mappings read', () => {
      const s = store();
      s.selectCategory('cat-1');

      expect(s.currentCategoryId()).toBe('cat-1');
      expect((s as unknown as Record<string, unknown>)['spaceTypeIds']).toBeUndefined();
    });

    it('mapSpaceType maps and reads nothing back', () => {
      const s = store();
      s.selectCategory('cat-1');
      const onDone = vi.fn();

      s.mapSpaceType('cat-1', 'st-1', { onDone });

      expect(api.mapCategorySpaceType).toHaveBeenCalledWith('cat-1', 'st-1');
      expect(onDone).toHaveBeenCalled();
    });

    it('searches the cached tree by code, nameEn and nameAr, case-insensitively', () => {
      api.getCategories.mockReturnValue(
        of([
          category('lighting', { nameEn: 'Lighting', nameAr: 'إضاءة' }),
          category('seating', { nameEn: 'Seating', nameAr: 'جلوس' }),
        ]),
      );
      const s = store();
      s.init(null);

      s.search('LIGHT');
      expect(s.searchResults().map((c) => c.id)).toEqual(['lighting']);
      s.search('جلوس');
      expect(s.searchResults().map((c) => c.id)).toEqual(['seating']);
      s.search('  ');
      expect(s.searchTerm()).toBe('');
      expect(s.searchResults()).toEqual([]);
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
  });

  // crmp C-4 (D4): activate/deactivate, delete (409 InUse), options, unmap, tree filter.
  describe('catalog admin (crmp C-4)', () => {
    it('setActive() calls api.setEntryActive and reports done', () => {
      const onDone = vi.fn();
      store().setActive('items', 'i1', false, { onDone });
      expect(api.setEntryActive).toHaveBeenCalledWith('items', 'i1', false);
      expect(onDone).toHaveBeenCalledOnce();
    });

    it('deleteEntry() on 409 crm.catalog.InUse hands the code back and sets no page error', () => {
      api.deleteEntry.mockReturnValue(
        throwError(
          () =>
            new HttpErrorResponse({
              status: 409,
              error: { errors: { 'crm.catalog.InUse': ['in use'] } },
            }),
        ),
      );
      const onError = vi.fn();
      const s = store();
      s.deleteEntry('categories', 'c1', { onError });
      expect(onError.mock.calls[0][0].code).toBe('crm.catalog.InUse');
      expect(s.error()).toBeNull();
      expect(s.saving()).toBe(false);
    });

    it('loadOptions() reads with the toggle and the toggle re-reads loaded attributes', () => {
      const s = store();
      s.loadOptions('a1');
      expect(api.attributeOptions).toHaveBeenLastCalledWith('a1', false);
      s.setIncludeInactiveOptions(true);
      expect(api.attributeOptions).toHaveBeenLastCalledWith('a1', true);
      expect(s.options()['a1']).toEqual([]);
    });

    it('unmapSpaceType() calls the unmap route', () => {
      store().unmapSpaceType('c1', 'st-1');
      expect(api.unmapCategorySpaceType).toHaveBeenCalledWith('c1', 'st-1');
    });

    it('filterBySpaceType() reads tree?spaceTypeId; null clears it', () => {
      api.treeForSpaceType.mockReturnValue(of([category('kitchen')]));
      const s = store();
      s.filterBySpaceType('st-1');
      expect(api.treeForSpaceType).toHaveBeenCalledWith('st-1');
      expect(s.spaceTypeResults().map((c) => c.id)).toEqual(['kitchen']);
      s.filterBySpaceType(null);
      expect(s.spaceTypeFilter()).toBeNull();
      expect(s.spaceTypeResults()).toEqual([]);
    });
  });
});

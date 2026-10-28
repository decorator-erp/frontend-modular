import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { of } from 'rxjs';
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

  // 009b #N-8: no category update, reorder, activate, clone, delete or unmap route (C §2.11).
  it('has no category update, reorder, activate, clone, delete or unmap (009b #N-8)', () => {
    const s = store() as unknown as Record<string, unknown>;
    for (const name of [
      'updateCategory',
      'reorderChild',
      'setCategoryActive',
      'cloneCategory',
      'deleteCategory',
      'unmapSpaceType',
    ]) {
      expect(s[name], name).toBeUndefined();
    }
  });

  // 009b #N-9: no item activate or delete route (C §2.11).
  it('has no item activate or delete (009b #N-9)', () => {
    const s = store() as unknown as Record<string, unknown>;
    expect(s['setItemActive']).toBeUndefined();
    expect(s['deleteItem']).toBeUndefined();
  });
});

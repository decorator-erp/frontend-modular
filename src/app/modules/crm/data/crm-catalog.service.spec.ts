import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { CatalogAttributeType, CatalogSelectionMode } from '../model/crm-enums';
import { environment } from '../../../../environments/environment';
import { CrmCatalogService } from './crm-catalog.service';
import type { CatalogCategory, CatalogItem } from '../model';

describe('CrmCatalogService', () => {
  let service: CrmCatalogService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [CrmCatalogService, provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(CrmCatalogService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  const url = (path: string) => `${environment.apiUrl}${path}`;

  // `itemsForSpaceType()` — REMOVED (Run B, F5) along with its sole caller,
  // `record-items-dialog.component.ts`. `getItems()` went too (009b #35): the only item
  // read left is `itemsByCategory()`.

  // 009b #34: CrmCatalogEndpoints.cs:83-88 serves the whole tree, flat, from GET /tree
  // (CrmCatalogCategoryResponse, CatalogContracts.cs:5-7) — no description, image or
  // spaceTypeIds; subtree and isActive filtering happen client-side.
  describe('getCategories() — GET /tree (009b #34)', () => {
    const wire = (id: string, path: string, isActive = true, parentId: string | null = null) => ({
      id,
      parentId,
      code: id,
      nameEn: id,
      nameAr: id,
      selectionMode: CatalogSelectionMode.None,
      isRequired: false,
      sortOrder: 0,
      path,
      depth: path.split('/').length - 3,
      isActive,
    });

    it('reads the flat tree and normalizes it to the wire fields plus a trackKey', () => {
      let categories: CatalogCategory[] = [];
      service.getCategories(null, true).subscribe((r) => (categories = r));

      const req = http.expectOne(url('/crm/catalog/tree'));
      expect(req.request.method).toBe('GET');
      expect(req.request.params.keys()).toEqual([]);
      req.flush([wire('cat-1', '/cat-1/')]);

      expect(categories).toEqual([
        {
          id: 'cat-1',
          parentId: null,
          code: 'cat-1',
          nameEn: 'cat-1',
          nameAr: 'cat-1',
          path: '/cat-1/',
          depth: 0,
          selectionMode: CatalogSelectionMode.None,
          isRequired: false,
          sortOrder: 0,
          isActive: true,
          trackKey: 'cat-1',
        },
      ]);
    });

    it('filters the subtree and inactive rows client-side', () => {
      let ids: string[] = [];
      service.getCategories('a').subscribe((r) => (ids = r.map((c) => c.id)));

      http
        .expectOne(url('/crm/catalog/tree'))
        .flush([
          wire('a', '/a/'),
          wire('b', '/a/b/', true, 'a'),
          wire('c', '/a/c/', false, 'a'),
          wire('d', '/d/'),
        ]);

      expect(ids).toEqual(['a', 'b']);
    });
  });

  // 009b #35: CrmCatalogEndpoints.cs:90-96 — the only item read is per category
  // (CrmCatalogItemResponse, CatalogContracts.cs:9-11): no facets, attributes, description
  // or image.
  describe('itemsByCategory() (009b #35)', () => {
    it('GETs the category items route with no facet params', () => {
      let items: CatalogItem[] = [];
      service.itemsByCategory('C').subscribe((r) => (items = r));

      const req = http.expectOne(url('/crm/catalog/categories/C/items'));
      expect(req.request.method).toBe('GET');
      expect(req.request.params.keys()).toEqual([]);
      req.flush([
        {
          id: 'item-1',
          categoryId: 'C',
          code: 'oak-wardrobe',
          nameEn: 'Oak wardrobe',
          nameAr: 'دولاب خشب',
          isPurchasable: true,
          sortOrder: 0,
          isActive: false,
        },
      ]);

      expect(items[0].categoryId).toBe('C');
      expect(items[0].isActive).toBe(false);
      expect(items[0].attributes).toEqual([]);
      expect(items[0].trackKey).toBe('item-1');
    });
  });

  // 009b #38: CreateCrmCatalogItemCommand (CatalogContracts.cs:35-37) binds no description or
  // image; CrmCatalogEndpoints.cs:49-54 answers 201 { itemId }.
  describe('createItem() (009b #38)', () => {
    it('posts only the bound fields and reads the 201 { itemId }', () => {
      let id: string | undefined;
      service
        .createItem({ categoryId: 'C', code: 'oak', nameEn: 'Oak', nameAr: 'بلوط' })
        .subscribe((r) => (id = r));

      const req = http.expectOne(url('/crm/catalog/items'));
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({
        categoryId: 'C',
        code: 'oak',
        nameEn: 'Oak',
        nameAr: 'بلوط',
        isPurchasable: true,
        sortOrder: 0,
      });
      req.flush({ itemId: 'I' });

      expect(id).toBe('I');
    });
  });

  // 009b #39: CrmCatalogEndpoints.cs:64-70 — the category id moved into the body
  // (CreateCrmCatalogAttributeCommand, CatalogContracts.cs:39-41); 201 { attributeId }.
  describe('addAttribute() (009b #39)', () => {
    it('posts to /attributes with categoryId in the body and reads the 201 { attributeId }', () => {
      let id: string | undefined;
      service
        .addAttribute('C', {
          code: 'width',
          nameEn: 'Width',
          nameAr: 'العرض',
          dataType: CatalogAttributeType.Number,
          unit: 'mm',
        })
        .subscribe((r) => (id = r));

      const req = http.expectOne(url('/crm/catalog/attributes'));
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({
        categoryId: 'C',
        code: 'width',
        nameEn: 'Width',
        nameAr: 'العرض',
        dataType: CatalogAttributeType.Number,
        unit: 'mm',
        isRequired: false,
        sortOrder: 0,
      });
      req.flush({ attributeId: 'A' });

      expect(id).toBe('A');
    });
  });

  describe('setItemAttributeValues() — replace-all', () => {
    it('PUTs to the item attribute-values route with null-filled optional members', () => {
      service
        .setItemAttributeValues('item-1', [{ attributeId: 'attr-1', valueText: 'Matte' }])
        .subscribe();

      const req = http.expectOne(url('/crm/catalog/items/item-1/attribute-values'));
      expect(req.request.method).toBe('PUT');
      expect(req.request.body).toEqual({
        values: [
          {
            attributeId: 'attr-1',
            valueText: 'Matte',
            valueNumber: null,
            valueBool: null,
            valueDate: null,
            optionId: null,
          },
        ],
      });
      req.flush(null);
    });
  });

  // 009b #36: CrmCatalogEndpoints.cs:98-104 returns a category's OWN attributes only, with no
  // options (GetCrmCatalogAttributesByCategoryQueryHandler.cs:16); the /nodes/* alias is gone.
  describe('effectiveAttributes() — own + ancestors, walked client-side (009b #36)', () => {
    const cat = (id: string, parentId: string | null, path: string) => ({
      id,
      parentId,
      code: id,
      nameEn: id,
      nameAr: id,
      selectionMode: CatalogSelectionMode.None,
      isRequired: false,
      sortOrder: 0,
      path,
      depth: 0,
      isActive: true,
    });
    const attr = (id: string, categoryId: string) => ({
      id,
      categoryId,
      code: id,
      nameEn: id,
      nameAr: id,
      dataType: CatalogAttributeType.Select,
      unit: null,
      isRequired: false,
      sortOrder: 0,
      isActive: true,
    });

    it('reads the tree, then each ancestor and the category itself, ancestor-first', () => {
      let ids: string[] = [];
      let categoryIds: string[] = [];
      service.effectiveAttributes('C').subscribe((r) => {
        ids = r.map((a) => a.id);
        categoryIds = r.map((a) => a.categoryId);
      });

      http
        .expectOne(url('/crm/catalog/tree'))
        .flush([cat('A', null, '/A/'), cat('B', 'A', '/A/B/'), cat('C', 'B', '/A/B/C/')]);
      http.expectOne(url('/crm/catalog/categories/A/attributes')).flush([attr('a1', 'A')]);
      http.expectOne(url('/crm/catalog/categories/B/attributes')).flush([]);
      http.expectOne(url('/crm/catalog/categories/C/attributes')).flush([attr('c1', 'C')]);
      http.expectNone((r) => r.url.includes('/nodes/'));

      expect(ids).toEqual(['a1', 'c1']);
      expect(categoryIds).toEqual(['A', 'C']);
    });

    it('falls back to the own route alone for an id missing from the tree', () => {
      let ids: string[] = [];
      service.effectiveAttributes('X').subscribe((r) => (ids = r.map((a) => a.id)));

      http.expectOne(url('/crm/catalog/tree')).flush([]);
      http.expectOne(url('/crm/catalog/categories/X/attributes')).flush([attr('x1', 'X')]);

      expect(ids).toEqual(['x1']);
    });

    it('normalizes options to [] — no route reads them', () => {
      let options: unknown[] | undefined;
      service.categoryAttributes('C').subscribe((r) => (options = r[0].options));

      http.expectOne(url('/crm/catalog/categories/C/attributes')).flush([attr('c1', 'C')]);

      expect(options).toEqual([]);
    });
  });

  describe('v2 category reads (F6)', () => {
    it('categoryAttributes() hits the v2 route and normalizes like effectiveAttributes()', () => {
      let categoryId: string | undefined;
      service.categoryAttributes('cat-1').subscribe((attrs) => (categoryId = attrs[0]?.categoryId));

      http.expectOne(url('/crm/catalog/categories/cat-1/attributes')).flush([
        {
          id: 'attr-1',
          nodeId: 'cat-1',
          code: 'style',
          nameEn: 'Style',
          nameAr: 'الطراز',
          dataType: CatalogAttributeType.Select,
          unit: null,
          isRequired: true,
          sortOrder: 0,
          isActive: true,
          options: [],
        },
      ]);

      expect(categoryId).toBe('cat-1');
    });
  });

  // 009b #N-7: C §2.11 — no route reads mappings, ancestors, a category search or one item.
  it('has no mappings, ancestors, search or single-item read (009b #N-7)', () => {
    const methods = service as unknown as Record<string, unknown>;
    for (const name of [
      'getCategorySpaceTypes',
      'categoryAncestors',
      'searchCategories',
      'getItem',
    ]) {
      expect(methods[name], name).toBeUndefined();
    }
  });

  describe('v2 category writes (F6)', () => {
    it('createCategory() POSTs with defaults filled in and reads the 201 { categoryId } (009b #40)', () => {
      let id: string | undefined;
      service
        .createCategory({ code: 'lighting', nameEn: 'Lighting', nameAr: 'إضاءة' })
        .subscribe((r) => (id = r));

      const req = http.expectOne(url('/crm/catalog/categories'));
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({
        parentId: null,
        code: 'lighting',
        nameEn: 'Lighting',
        nameAr: 'إضاءة',
        selectionMode: CatalogSelectionMode.None,
        isRequired: false,
        sortOrder: 0,
        descriptionEn: null,
        descriptionAr: null,
        imageUri: null,
      });
      req.flush({ categoryId: 'new-id' });

      expect(id).toBe('new-id');
    });

    it('addOption() POSTs the option and reads the 201 { optionId } (009b #40)', () => {
      let id: string | undefined;
      service
        .addOption('A', { code: 'oak', nameEn: 'Oak', nameAr: 'بلوط' })
        .subscribe((r) => (id = r));

      const req = http.expectOne(url('/crm/catalog/attributes/A/options'));
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({
        code: 'oak',
        nameEn: 'Oak',
        nameAr: 'بلوط',
        imageUri: null,
        sortOrder: 0,
      });
      req.flush({ optionId: 'O' });

      expect(id).toBe('O');
    });

    it('moveCategory() PUTs to /parent, null = move to root', () => {
      service.moveCategory('cat-1', { newParentId: null }).subscribe();

      const req = http.expectOne(url('/crm/catalog/categories/cat-1/parent'));
      expect(req.request.method).toBe('PUT');
      expect(req.request.body).toEqual({ newParentId: null });
      req.flush(null);
    });

    // 009b #37: CrmCatalogEndpoints.cs:42-47 takes the space type in the path, binds no body.
    it('mapCategorySpaceType() hits the space-types sub-route', () => {
      service.mapCategorySpaceType('cat-1', 'st-1').subscribe();
      const mapReq = http.expectOne(url('/crm/catalog/categories/cat-1/space-types/st-1'));
      expect(mapReq.request.method).toBe('POST');
      expect(mapReq.request.body).toBeNull();
      mapReq.flush(null);
    });
  });

  // 009b #N-8: CrmCatalogEndpoints.cs:27-47 maps category create, move and map only (C §2.11).
  it('has no category update, reorder, activate, clone, delete or unmap (009b #N-8)', () => {
    const methods = service as unknown as Record<string, unknown>;
    for (const name of [
      'updateCategory',
      'reorderCategories',
      'setCategoryActive',
      'cloneCategory',
      'deleteCategory',
      'unmapCategorySpaceType',
    ]) {
      expect(methods[name], name).toBeUndefined();
    }
  });
});

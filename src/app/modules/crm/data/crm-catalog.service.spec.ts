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
  // `record-items-dialog.component.ts`. The storefront that replaces it uses
  // `getItems({ spaceTypeId })`, covered below under 'getItems() — the v2 faceted feed'.

  describe('getCategories() — v2', () => {
    it('normalizes spaceTypeIds and gives every row a trackKey', () => {
      let categories: CatalogCategory[] = [];
      service.getCategories().subscribe((r) => (categories = r));

      http
        .expectOne((r) => r.url === url('/crm/catalog/categories'))
        .flush([
          {
            id: 'cat-1',
            parentId: null,
            code: 'furniture',
            nameEn: 'Furniture',
            nameAr: 'أثاث',
            descriptionEn: null,
            descriptionAr: null,
            imageUri: null,
            path: '/cat-1/',
            depth: 0,
            selectionMode: CatalogSelectionMode.None,
            isRequired: true,
            sortOrder: 0,
            isActive: true,
            spaceTypeIds: [],
          },
        ]);

      expect(categories[0].spaceTypeIds).toEqual([]);
      expect(categories[0].trackKey).toBe('cat-1');
    });
  });

  describe('getItems() — the v2 faceted feed', () => {
    it('sends the facet params and normalizes attributes keyed by attributeId', () => {
      let items: CatalogItem[] = [];
      service
        .getItems({ spaceTypeId: 'st-1', attributeId: 'attr-1', optionId: 'opt-1' })
        .subscribe((r) => (items = r));

      const req = http.expectOne(
        (r) =>
          r.url === url('/crm/catalog/items') &&
          r.params.get('spaceTypeId') === 'st-1' &&
          r.params.get('attributeId') === 'attr-1' &&
          r.params.get('optionId') === 'opt-1',
      );
      req.flush([
        {
          id: 'item-1',
          categoryId: 'cat-1',
          code: 'oak-wardrobe',
          nameEn: 'Oak wardrobe',
          nameAr: 'دولاب خشب',
          descriptionEn: null,
          descriptionAr: null,
          imageUri: null,
          isPurchasable: true,
          sortOrder: 0,
          isActive: true,
          attributes: [
            {
              attributeId: 'attr-1',
              code: 'style',
              nameEn: 'Style',
              nameAr: 'الطراز',
              dataType: CatalogAttributeType.Select,
              unit: null,
              valueText: null,
              valueNumber: null,
              valueBool: null,
              valueDate: null,
              optionId: 'opt-1',
              optionNameEn: 'Modern',
              optionNameAr: 'حديث',
            },
          ],
        },
      ]);

      expect(items[0].categoryId).toBe('cat-1');
      expect(items[0].attributes[0].attributeId).toBe('attr-1');
      expect(items[0].trackKey).toBe('item-1');
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

  describe('normalizeAttribute() — the wire nodeId field carries a category id', () => {
    it('exposes the wire nodeId under categoryId', () => {
      service.effectiveAttributes('cat-1').subscribe((attrs) => {
        expect(attrs[0].categoryId).toBe('cat-1');
      });

      http
        .expectOne(() => true)
        .flush([
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

    it('categoryAncestors() normalizes the still-v1-node-shaped route into a breadcrumb', () => {
      let ids: string[] = [];
      service.categoryAncestors('cat-3').subscribe((r) => (ids = r.map((n) => n.id)));

      http.expectOne(url('/crm/catalog/categories/cat-3/ancestors')).flush([
        {
          id: 'cat-1',
          parentId: null,
          code: 'root',
          nameEn: 'Root',
          nameAr: 'Root',
          descriptionEn: null,
          descriptionAr: null,
          imageUri: null,
          path: '/cat-1/',
          depth: 0,
          isSelectable: false,
          selectionMode: CatalogSelectionMode.None,
          isRequired: false,
          isPurchasable: true,
          sortOrder: 0,
          isActive: true,
        },
      ]);

      expect(ids).toEqual(['cat-1']);
    });

    it('searchCategories() sends term + take, returns v2 category shapes only', () => {
      let categories: CatalogCategory[] = [];
      service.searchCategories('lighting', 25).subscribe((r) => (categories = r));

      const req = http.expectOne(
        (r) =>
          r.url === url('/crm/catalog/categories/search') &&
          r.params.get('term') === 'lighting' &&
          r.params.get('take') === '25',
      );
      req.flush([
        {
          id: 'cat-9',
          parentId: null,
          code: 'lighting',
          nameEn: 'Lighting',
          nameAr: 'إضاءة',
          descriptionEn: null,
          descriptionAr: null,
          imageUri: null,
          path: '/cat-9/',
          depth: 0,
          selectionMode: CatalogSelectionMode.None,
          isRequired: false,
          sortOrder: 0,
          isActive: true,
          spaceTypeIds: [],
        },
      ]);

      expect(categories).toHaveLength(1);
      expect(categories[0].code).toBe('lighting');
    });
  });

  describe('v2 category writes (F6)', () => {
    it('createCategory() POSTs with defaults filled in', () => {
      service.createCategory({ code: 'lighting', nameEn: 'Lighting', nameAr: 'إضاءة' }).subscribe();

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
      req.flush('new-id');
    });

    it('updateCategory() PUTs the full replacement — selectionMode/isRequired always sent', () => {
      service
        .updateCategory('cat-1', {
          code: 'lighting',
          nameEn: 'Lighting',
          nameAr: 'إضاءة',
          selectionMode: CatalogSelectionMode.Single,
          isRequired: true,
        })
        .subscribe();

      const req = http.expectOne(url('/crm/catalog/categories/cat-1'));
      expect(req.request.method).toBe('PUT');
      expect(req.request.body).toEqual({
        code: 'lighting',
        nameEn: 'Lighting',
        nameAr: 'إضاءة',
        selectionMode: CatalogSelectionMode.Single,
        isRequired: true,
        descriptionEn: null,
        descriptionAr: null,
        imageUri: null,
      });
      req.flush(null);
    });

    it('moveCategory() PUTs to /parent, null = move to root', () => {
      service.moveCategory('cat-1', { newParentId: null }).subscribe();

      const req = http.expectOne(url('/crm/catalog/categories/cat-1/parent'));
      expect(req.request.method).toBe('PUT');
      expect(req.request.body).toEqual({ newParentId: null });
      req.flush(null);
    });

    it('reorderCategories() sends parentId as a query param, omitted for root siblings', () => {
      service.reorderCategories(null, { items: [{ id: 'cat-1', sortOrder: 0 }] }).subscribe();
      const req = http.expectOne((r) => r.url === url('/crm/catalog/categories/reorder'));
      expect(req.request.method).toBe('PUT');
      req.flush(null);
    });

    it('setCategoryActive() PUTs isActive', () => {
      service.setCategoryActive('cat-1', false).subscribe();
      const req = http.expectOne(url('/crm/catalog/categories/cat-1/active'));
      expect(req.request.body).toEqual({ isActive: false });
      req.flush(null);
    });

    it('cloneCategory() POSTs newParentId/newCode and returns the new id', () => {
      let newId: string | undefined;
      service
        .cloneCategory('cat-1', { newParentId: 'cat-2', newCode: 'lighting_copy' })
        .subscribe((id) => (newId = id));

      const req = http.expectOne(url('/crm/catalog/categories/cat-1/clone'));
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({ newParentId: 'cat-2', newCode: 'lighting_copy' });
      req.flush('cloned-id');

      expect(newId).toBe('cloned-id');
    });

    it('deleteCategory() DELETEs the category route', () => {
      service.deleteCategory('cat-1').subscribe();
      const req = http.expectOne(url('/crm/catalog/categories/cat-1'));
      expect(req.request.method).toBe('DELETE');
      req.flush(null);
    });

    it('mapCategorySpaceType() / unmapCategorySpaceType() hit the space-types sub-route', () => {
      service.mapCategorySpaceType('cat-1', 'st-1').subscribe();
      const mapReq = http.expectOne(url('/crm/catalog/categories/cat-1/space-types'));
      expect(mapReq.request.method).toBe('POST');
      expect(mapReq.request.body).toEqual({ spaceTypeId: 'st-1' });
      mapReq.flush(null);

      service.unmapCategorySpaceType('cat-1', 'st-1').subscribe();
      const unmapReq = http.expectOne(url('/crm/catalog/categories/cat-1/space-types/st-1'));
      expect(unmapReq.request.method).toBe('DELETE');
      unmapReq.flush(null);
    });
  });
});

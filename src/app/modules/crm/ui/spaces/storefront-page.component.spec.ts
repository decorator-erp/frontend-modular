import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { CrmProvisionStatus } from '../../model/crm-enums';
import type { CrmSpace, CrmSpaceType, SpaceItem } from '../../model';
import { CatalogStore } from '../../stores/catalog.store';
import { SpacesStore } from '../../stores/spaces.store';
import { CrmStorefrontPageComponent } from './storefront-page.component';
import type { ProductCardVm } from './storefront-product-card.component';

const KITCHEN_TYPE: CrmSpaceType = {
  id: 'st-1',
  code: 'kitchen',
  nameEn: 'Kitchen',
  nameAr: 'المطبخ',
};
const SPACE: CrmSpace = {
  id: 'space-1',
  projectId: 'project-1',
  spaceType: KITCHEN_TYPE,
  name: 'Kitchen',
  sortOrder: 0,
  isActive: true,
  description: null,
};

function spaceItem(over: Partial<SpaceItem> = {}): SpaceItem {
  return {
    id: 'row-1',
    spaceId: 'space-1',
    catalogItemId: 'item-1',
    nodeNameEn: 'Item',
    nodeNameAr: 'Item',
    imageUri: null,
    isPurchasable: true,
    path: [],
    status: CrmProvisionStatus.ToBuy,
    note: null,
    sourceBriefSpaceId: null,
    attributes: [],
    isCustom: false,
    customName: null,
    customCategoryId: null,
    trackKey: 'row-1',
    ...over,
  };
}

/**
 * Integration surface only — the filtering/facet/lock LOGIC has its own exhaustive spec
 * (`storefront-filters.spec.ts`, pure, no Angular). This covers what that can't: the store
 * wiring on construction, and that each card/cart action dispatches the right store call.
 */
describe('CrmStorefrontPageComponent', () => {
  let store: {
    load: ReturnType<typeof vi.fn>;
    spaces: ReturnType<typeof vi.fn>;
    board: ReturnType<typeof vi.fn>;
    completeness: ReturnType<typeof vi.fn>;
    addItem: ReturnType<typeof vi.fn>;
    addCustomItem: ReturnType<typeof vi.fn>;
    removeItem: ReturnType<typeof vi.fn>;
    setItemStatus: ReturnType<typeof vi.fn>;
  };
  let catalogStore: {
    loadCategories: ReturnType<typeof vi.fn>;
    categories: ReturnType<typeof vi.fn>;
    loadItemsForSpaceType: ReturnType<typeof vi.fn>;
    itemsForSpaceType: ReturnType<typeof vi.fn>;
    poolLoading: ReturnType<typeof vi.fn>;
  };
  let router: { navigate: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    store = {
      load: vi.fn(),
      spaces: vi.fn().mockReturnValue([SPACE]),
      board: vi.fn().mockReturnValue([]),
      completeness: vi.fn().mockReturnValue(undefined),
      addItem: vi.fn(),
      addCustomItem: vi.fn(),
      removeItem: vi.fn(),
      setItemStatus: vi.fn(),
    };
    catalogStore = {
      loadCategories: vi.fn(),
      categories: vi.fn().mockReturnValue([]),
      loadItemsForSpaceType: vi.fn(),
      itemsForSpaceType: vi.fn().mockReturnValue(undefined),
      poolLoading: vi.fn().mockReturnValue(false),
    };
    router = { navigate: vi.fn() };

    TestBed.configureTestingModule({
      providers: [
        { provide: SpacesStore, useValue: store },
        { provide: CatalogStore, useValue: catalogStore },
        { provide: Router, useValue: router },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              paramMap: new Map([
                ['projectId', 'project-1'],
                ['spaceId', 'space-1'],
              ]),
            },
          },
        },
      ],
    });
  });

  function make(): CrmStorefrontPageComponent {
    const fixture = TestBed.createComponent(CrmStorefrontPageComponent);
    fixture.detectChanges();
    return fixture.componentInstance;
  }

  it('loads the space registry and the category tree on construction', () => {
    make();
    expect(store.load).toHaveBeenCalledWith('project-1');
    expect(catalogStore.loadCategories).toHaveBeenCalled();
  });

  it('loads the pool for the resolved space type once the space itself resolves', () => {
    make();
    expect(catalogStore.loadItemsForSpaceType).toHaveBeenCalledWith('st-1');
  });

  describe('onCardAction — the tri-state dispatch', () => {
    function card(over: Partial<ProductCardVm> = {}): ProductCardVm {
      return {
        item: {
          id: 'item-1',
          categoryId: 'cat-1',
          code: 'item-1',
          nameEn: 'Item',
          nameAr: 'Item',
          descriptionEn: null,
          descriptionAr: null,
          imageUri: null,
          isPurchasable: true,
          sortOrder: 0,
          isActive: true,
          attributes: [],
          trackKey: 'item-1',
        },
        categoryName: 'Category',
        rootCategoryId: 'cat-1',
        specs: [],
        state: 'add',
        ...over,
      };
    }

    it("'add' calls addItem with the item's id", () => {
      const c = make();
      c.onCardAction(card({ state: 'add' }));
      expect(store.addItem).toHaveBeenCalledWith(
        'space-1',
        { catalogNodeId: 'item-1' },
        expect.anything(),
      );
    });

    it("'added' calls removeItem with the MATCHING BOARD ROW's id, not the item's id", () => {
      store.board.mockReturnValue([
        spaceItem({ id: 'row-9', catalogItemId: 'item-1' }),
        spaceItem({ id: 'row-2', catalogItemId: 'item-other' }),
      ]);
      const c = make();
      c.onCardAction(card({ state: 'added' }));
      expect(store.removeItem).toHaveBeenCalledWith('space-1', 'row-9');
      expect(store.addItem).not.toHaveBeenCalled();
    });

    it("'locked' calls neither addItem nor removeItem", () => {
      const c = make();
      c.onCardAction(card({ state: 'locked' }));
      expect(store.addItem).not.toHaveBeenCalled();
      expect(store.removeItem).not.toHaveBeenCalled();
    });
  });

  describe('addCustom', () => {
    it('is a no-op with no text or no category selected', () => {
      const c = make();
      c.customText.set('');
      c.customCategoryId.set('cat-1');
      c.addCustom();
      expect(store.addCustomItem).not.toHaveBeenCalled();

      c.customText.set('Vintage lamp');
      c.customCategoryId.set('');
      c.addCustom();
      expect(store.addCustomItem).not.toHaveBeenCalled();
    });

    it('calls addCustomItem and clears the text field on done', () => {
      store.addCustomItem.mockImplementation(
        (_sp: string, _cat: string, _name: string, handlers: { onDone?: () => void }) =>
          handlers.onDone?.(),
      );
      const c = make();
      c.customText.set('Vintage lamp');
      c.customCategoryId.set('cat-lighting');
      c.addCustom();

      expect(store.addCustomItem).toHaveBeenCalledWith(
        'space-1',
        'cat-lighting',
        'Vintage lamp',
        expect.anything(),
      );
      expect(c.customText()).toBe('');
    });
  });

  describe('cycleStatus / removeRow', () => {
    it('cycleStatus advances the row to the next status', () => {
      const c = make();
      c.cycleStatus({ id: 'row-1', status: CrmProvisionStatus.ToBuy });
      expect(store.setItemStatus).toHaveBeenCalledWith('space-1', 'row-1', {
        status: CrmProvisionStatus.ClientHas,
      });
    });

    it('removeRow calls removeItem with the row id', () => {
      const c = make();
      c.removeRow('row-1');
      expect(store.removeItem).toHaveBeenCalledWith('space-1', 'row-1');
    });
  });

  it('back() navigates to the absolute spaces path, never a relative one', () => {
    // Flat sibling routes in crmRoutes make relative `..` navigation from this route
    // exit the whole crm boundary rather than trimming one path segment — see back()'s
    // own doc comment. This spec pins the absolute-path behavior against that regression.
    const c = make();
    c.back();
    expect(router.navigate).toHaveBeenCalledWith(['/crm/projects', 'project-1', 'spaces']);
  });
});

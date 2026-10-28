import { describe, expect, it } from 'vitest';
import {
  CatalogAttributeType,
  CatalogSelectionMode,
  CrmProvisionStatus,
} from '../../model/crm-enums';
import type { CatalogCategory, CatalogItem, ItemAttributeValue, SpaceItem } from '../../model';
import {
  activeFilterCount,
  categoryApplies,
  facetAttributesOf,
  facetOptionCounts,
  filteredItems,
  isSingleLocked,
  offeredCategories,
  rowCategoryId,
  type StorefrontFilters,
} from './storefront-filters';

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

function attrValue(over: Partial<ItemAttributeValue> = {}): ItemAttributeValue {
  return {
    attributeId: 'attr-style',
    code: 'style',
    nameEn: 'Style',
    nameAr: 'الطراز',
    dataType: CatalogAttributeType.Select,
    unit: null,
    valueText: null,
    valueNumber: null,
    valueBool: null,
    valueDate: null,
    optionId: null,
    optionNameEn: null,
    optionNameAr: null,
    ...over,
  };
}

function item(id: string, categoryId: string, over: Partial<CatalogItem> = {}): CatalogItem {
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
    ...over,
  };
}

const searchable = (i: CatalogItem) => `${i.nameEn} ${i.nameAr}`;

describe('categoryApplies / offeredCategories', () => {
  const FURNITURE = category('furniture');
  const SEATING = category('seating', { parentId: 'furniture' });
  const LIGHTING = category('lighting', { spaceTypeIds: ['st-kitchen'] });
  const byId = new Map([FURNITURE, SEATING, LIGHTING].map((c) => [c.id, c]));

  it('a category with no targeting anywhere in its chain is global', () => {
    expect(categoryApplies(SEATING, 'st-bedroom', byId)).toBe(true);
    expect(categoryApplies(SEATING, 'st-kitchen', byId)).toBe(true);
  });

  it('a category targeted to one space type does not apply to another', () => {
    expect(categoryApplies(LIGHTING, 'st-bedroom', byId)).toBe(false);
    expect(categoryApplies(LIGHTING, 'st-kitchen', byId)).toBe(true);
  });

  it('offeredCategories excludes non-leaf categories', () => {
    // LIGHTING is targeted to st-kitchen only, so at st-bedroom only SEATING (global) offers.
    const offered = offeredCategories('st-bedroom', [FURNITURE, SEATING, LIGHTING]);
    expect(offered.map((c) => c.id)).toEqual(['seating']);
    // FURNITURE has a child (SEATING), so it is never offered directly.
    expect(offered.some((c) => c.id === 'furniture')).toBe(false);
  });

  it('offeredCategories excludes inactive categories', () => {
    const inactive = category('retired', { isActive: false });
    expect(offeredCategories('st-bedroom', [inactive]).map((c) => c.id)).toEqual([]);
  });

  it('offeredCategories excludes categories not targeted to this space type', () => {
    expect(offeredCategories('st-bedroom', [LIGHTING]).map((c) => c.id)).toEqual([]);
    expect(offeredCategories('st-kitchen', [LIGHTING]).map((c) => c.id)).toEqual(['lighting']);
  });
});

describe('filteredItems — category + facet + search, AND across groups, OR within', () => {
  const SOFA = item('sofa-1', 'seating', {
    nameEn: 'Modern sofa',
    attributes: [attrValue({ optionId: 'opt-modern', optionNameEn: 'Modern' })],
  });
  const CHAIR = item('chair-1', 'seating', {
    nameEn: 'Classic chair',
    attributes: [attrValue({ optionId: 'opt-classic', optionNameEn: 'Classic' })],
  });
  const LAMP = item('lamp-1', 'lighting', {
    nameEn: 'Table lamp',
    attributes: [], // no Style value at all
  });
  const POOL = [SOFA, CHAIR, LAMP];

  it('with no filters, returns everything', () => {
    expect(
      filteredItems(POOL, { categoryIds: new Set(), facets: new Map(), term: '' }, searchable),
    ).toHaveLength(3);
  });

  it('category filter restricts to the selected category ids (OR within)', () => {
    const filters: StorefrontFilters = {
      categoryIds: new Set(['lighting']),
      facets: new Map(),
      term: '',
    };
    expect(filteredItems(POOL, filters, searchable).map((i) => i.id)).toEqual(['lamp-1']);
  });

  it('a facet selection EXCLUDES items with no value for that attribute, not just deranks them', () => {
    const filters: StorefrontFilters = {
      categoryIds: new Set(),
      facets: new Map([['attr-style', new Set(['opt-modern'])]]),
      term: '',
    };
    const result = filteredItems(POOL, filters, searchable);
    expect(result.map((i) => i.id)).toEqual(['sofa-1']);
    // LAMP has no Style value at all — it must be gone, not merely ranked last.
    expect(result.some((i) => i.id === 'lamp-1')).toBe(false);
  });

  it('multi-select within one facet group is OR', () => {
    const filters: StorefrontFilters = {
      categoryIds: new Set(),
      facets: new Map([['attr-style', new Set(['opt-modern', 'opt-classic'])]]),
      term: '',
    };
    expect(
      filteredItems(POOL, filters, searchable)
        .map((i) => i.id)
        .sort(),
    ).toEqual(['chair-1', 'sofa-1']);
  });

  it('search term is case-insensitive substring, applied alongside every other filter', () => {
    const filters: StorefrontFilters = {
      categoryIds: new Set(),
      facets: new Map(),
      term: 'MODERN',
    };
    expect(filteredItems(POOL, filters, searchable).map((i) => i.id)).toEqual(['sofa-1']);
  });
});

describe('facetAttributesOf — Select-typed only, first-encountered order', () => {
  it('excludes non-Select attributes', () => {
    const pool = [
      item('i1', 'c1', {
        attributes: [
          attrValue({ attributeId: 'a-style', dataType: CatalogAttributeType.Select }),
          attrValue({ attributeId: 'a-width', dataType: CatalogAttributeType.Number }),
        ],
      }),
    ];
    expect(facetAttributesOf(pool).map((f) => f.attributeId)).toEqual(['a-style']);
  });

  it('dedupes an attribute seen across multiple items', () => {
    const pool = [
      item('i1', 'c1', { attributes: [attrValue({ attributeId: 'a-style' })] }),
      item('i2', 'c1', { attributes: [attrValue({ attributeId: 'a-style' })] }),
    ];
    expect(facetAttributesOf(pool)).toHaveLength(1);
  });
});

describe('facetOptionCounts — self-excluding', () => {
  const SOFA = item('sofa-1', 'seating', {
    attributes: [attrValue({ optionId: 'opt-modern', optionNameEn: 'Modern' })],
  });
  const CHAIR = item('chair-1', 'seating', {
    attributes: [attrValue({ optionId: 'opt-classic', optionNameEn: 'Classic' })],
  });

  it('counts only options actually present in `self`', () => {
    const counts = facetOptionCounts('attr-style', [SOFA, CHAIR], new Set());
    expect(counts.find((c) => c.optionId === 'opt-modern')?.count).toBe(1);
    expect(counts.find((c) => c.optionId === 'opt-classic')?.count).toBe(1);
  });

  it('a selected option with zero matches in `self` still renders, at count 0', () => {
    // Self excludes THIS group's own selection, so if every other filter eliminates every
    // row that would carry "opt-modern", the option must still appear (count 0) so the
    // user can un-check it — otherwise a selection could become permanently invisible.
    const counts = facetOptionCounts('attr-style', [CHAIR], new Set(['opt-modern']));
    const modern = counts.find((c) => c.optionId === 'opt-modern');
    expect(modern).toBeDefined();
    expect(modern?.count).toBe(0);
  });

  it('an unselected option with zero matches is omitted entirely', () => {
    const counts = facetOptionCounts('attr-style', [CHAIR], new Set());
    expect(counts.some((c) => c.optionId === 'opt-modern')).toBe(false);
  });
});

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

describe('rowCategoryId', () => {
  it("a catalog row's category is the SECOND-TO-LAST path crumb (path ends with the item)", () => {
    const row = spaceItem({
      isCustom: false,
      path: [
        { id: 'root', code: 'root', nameEn: 'Root', nameAr: 'Root' },
        { id: 'seating', code: 'seating', nameEn: 'Seating', nameAr: 'Seating' },
        { id: 'item-1', code: 'sofa', nameEn: 'Sofa', nameAr: 'Sofa' },
      ],
    });
    expect(rowCategoryId(row)).toBe('seating');
  });

  it("a custom row's category is the LAST path crumb (path ends AT the category)", () => {
    const row = spaceItem({
      isCustom: true,
      customCategoryId: 'seating',
      path: [
        { id: 'root', code: 'root', nameEn: 'Root', nameAr: 'Root' },
        { id: 'seating', code: 'seating', nameEn: 'Seating', nameAr: 'Seating' },
      ],
    });
    expect(rowCategoryId(row)).toBe('seating');
  });

  it('falls back to customCategoryId for a custom row with no path', () => {
    expect(
      rowCategoryId(spaceItem({ isCustom: true, path: [], customCategoryId: 'seating' })),
    ).toBe('seating');
  });
});

describe('isSingleLocked', () => {
  const BEDS = category('beds', { selectionMode: CatalogSelectionMode.Single });
  const SEATING = category('seating');
  const categories = [BEDS, SEATING];

  it('is false when no ancestor is Single', () => {
    const sofa = item('sofa-1', 'seating');
    expect(isSingleLocked(sofa, categories, [])).toBe(false);
  });

  it('is true when a catalog item is Single-ruled and the board already has a row in it', () => {
    const bed2 = item('bed-2', 'beds');
    const board = [
      spaceItem({
        id: 'row-1',
        isCustom: false,
        catalogItemId: 'bed-1',
        path: [
          { id: 'beds', code: 'beds', nameEn: 'Beds', nameAr: 'Beds' },
          { id: 'bed-1', code: 'bed', nameEn: 'Bed', nameAr: 'Bed' },
        ],
      }),
    ];
    expect(isSingleLocked(bed2, categories, board)).toBe(true);
  });

  it('a CUSTOM row occupying the Single category locks a catalog item just the same', () => {
    const bed2 = item('bed-2', 'beds');
    const board = [
      spaceItem({
        id: 'row-1',
        isCustom: true,
        customCategoryId: 'beds',
        path: [{ id: 'beds', code: 'beds', nameEn: 'Beds', nameAr: 'Beds' }],
      }),
    ];
    expect(isSingleLocked(bed2, categories, board)).toBe(true);
  });

  it('is false when the occupying row is in a DIFFERENT category', () => {
    const bed2 = item('bed-2', 'beds');
    const board = [
      spaceItem({
        id: 'row-1',
        isCustom: false,
        catalogItemId: 'sofa-1',
        path: [
          { id: 'seating', code: 'seating', nameEn: 'Seating', nameAr: 'Seating' },
          { id: 'sofa-1', code: 'sofa', nameEn: 'Sofa', nameAr: 'Sofa' },
        ],
      }),
    ];
    expect(isSingleLocked(bed2, categories, board)).toBe(false);
  });
});

describe('activeFilterCount', () => {
  it('sums categories + every facet selection + 1 for a non-blank term', () => {
    const filters: StorefrontFilters = {
      categoryIds: new Set(['c1', 'c2']),
      facets: new Map([
        ['a1', new Set(['o1'])],
        ['a2', new Set(['o2', 'o3'])],
      ]),
      term: '  modern  ',
    };
    expect(activeFilterCount(filters)).toBe(2 + 1 + 2 + 1);
  });

  it('a whitespace-only term contributes 0, not 1', () => {
    const filters: StorefrontFilters = { categoryIds: new Set(), facets: new Map(), term: '   ' };
    expect(activeFilterCount(filters)).toBe(0);
  });
});

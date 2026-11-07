import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { ConfirmService } from '@ds';
import { PermissionsService } from '@platform/permissions/permissions.service';
import { CrmLookupService } from '../../../data/crm-lookup.service';
import { CatalogAdminStore } from '../../../stores/catalog-admin.store';
import { CrmCatalogService } from '../../../data/crm-catalog.service';
import { CatalogAttributeType, CatalogSelectionMode } from '../../../model/crm-enums';
import type { CatalogCategory, CatalogItem, CrmSpaceType } from '../../../model';
import { CrmCatalogCategoryDetailComponent } from './catalog-category-detail.component';

const types: CrmSpaceType[] = [
  { id: 'T1', code: 'living', nameEn: 'Living', nameAr: 'معيشة', sortOrder: 1, isActive: true },
  { id: 'T2', code: 'attic', nameEn: 'Attic', nameAr: 'علية', sortOrder: 2, isActive: false },
  { id: 'T3', code: 'kids', nameEn: 'Kids', nameAr: 'أطفال', sortOrder: 3, isActive: true },
];

/** The C-4 store surface the rail reads, with overrides. */
function storeMock(over: Record<string, unknown> = {}) {
  return {
    currentCategory: signal<CatalogCategory | null>(null),
    effectiveAttributes: signal([]),
    items: signal([]),
    saving: signal(false),
    options: signal<Record<string, unknown[]>>({}),
    includeInactiveOptions: signal(false),
    spaceTypeFilter: signal<string | null>(null),
    spaceTypeResults: signal([]),
    loadOptions: vi.fn(),
    setIncludeInactiveOptions: vi.fn(),
    setActive: vi.fn(),
    deleteEntry: vi.fn(),
    unmapSpaceType: vi.fn(),
    mapSpaceType: vi.fn(),
    reload: vi.fn(),
    ...over,
  };
}

const CATEGORY: CatalogCategory = {
  id: 'C',
  parentId: null,
  code: 'c',
  nameEn: 'Cat',
  nameAr: 'Cat',
  path: '/C/',
  depth: 0,
  selectionMode: CatalogSelectionMode.None,
  isRequired: false,
  sortOrder: 0,
  isActive: true,
  trackKey: 'C',
};

const ITEM: CatalogItem = {
  id: 'I',
  categoryId: 'C',
  code: 'oak',
  nameEn: 'Oak',
  nameAr: 'Oak',
  descriptionEn: null,
  descriptionAr: null,
  imageUri: null,
  isPurchasable: true,
  sortOrder: 0,
  isActive: true,
  attributes: [],
  trackKey: 'I',
};

describe('CrmCatalogCategoryDetailComponent — targeting picker (009b #27)', () => {
  function make() {
    TestBed.configureTestingModule({
      imports: [CrmCatalogCategoryDetailComponent],
      providers: [
        { provide: CrmLookupService, useValue: { spaceTypes: () => of(types) } },
        { provide: CatalogAdminStore, useValue: storeMock() },
      ],
    });
    return TestBed.createComponent(CrmCatalogCategoryDetailComponent).componentInstance;
  }

  it('offers every active type for a mapping', () => {
    expect(
      make()
        .unmappedSpaceTypeOptions()
        .map((o) => o.value),
    ).toEqual(['T1', 'T3']);
  });

  it('still names an inactive type', () => {
    expect(make().spaceTypeName('T2')).toBe('Attic');
  });
});

// crmp C-4 (D4): edit / activate / delete, options read, unmap — gated on crm.catalog.manage.
describe('CrmCatalogCategoryDetailComponent — catalog admin (crmp C-4)', () => {
  let store: ReturnType<typeof storeMock>;
  const confirmOpen = vi.fn();

  function render(over: Record<string, unknown> = {}, canManage = true) {
    store = storeMock({ currentCategory: signal(CATEGORY), ...over });
    confirmOpen.mockReset();
    TestBed.configureTestingModule({
      imports: [CrmCatalogCategoryDetailComponent],
      providers: [
        { provide: PermissionsService, useValue: { can: () => canManage } },
        { provide: CrmLookupService, useValue: { spaceTypes: () => of(types) } },
        { provide: CrmCatalogService, useValue: {} },
        { provide: ConfirmService, useValue: { open: confirmOpen } },
        { provide: CatalogAdminStore, useValue: store },
      ],
    });
    const fixture = TestBed.createComponent(CrmCatalogCategoryDetailComponent);
    fixture.detectChanges();
    return { el: fixture.nativeElement as HTMLElement, fixture };
  }

  const byLabel = (el: HTMLElement, label: string) =>
    el.querySelector(`button[aria-label="${label}"]`) as HTMLButtonElement | null;

  it('gives the category Edit, Deactivate and Delete and each item labelled row actions', () => {
    const { el } = render({ items: signal([ITEM]) });
    const texts = [...el.querySelectorAll('[data-testid="cat-category-actions"] pera-button')].map(
      (b) => b.textContent?.trim(),
    );
    expect(texts).toEqual(['Edit', 'Deactivate', 'Delete']);
    expect(byLabel(el, 'Edit Oak')).toBeTruthy();
    expect(byLabel(el, 'Deactivate Oak')).toBeTruthy();
    expect(byLabel(el, 'Delete Oak')).toBeTruthy();
  });

  it('shows no write action without crm.catalog.manage', () => {
    const { el } = render({ items: signal([ITEM]) }, false);
    expect(el.querySelector('[data-testid="cat-category-actions"]')).toBeNull();
    expect(byLabel(el, 'Delete Oak')).toBeNull();
  });

  it('Deactivate on an item calls setActive(items, id, false)', () => {
    const { el } = render({ items: signal([ITEM]) });
    byLabel(el, 'Deactivate Oak')!.click();
    expect(store.setActive).toHaveBeenCalledWith('items', 'I', false, expect.anything());
  });

  it('a 409 crm.catalog.InUse on delete offers deactivate instead', async () => {
    const { el } = render({ items: signal([ITEM]) });
    confirmOpen.mockResolvedValue(true);
    store.deleteEntry.mockImplementation(
      (_k: string, _id: string, h: { onError: (e: { code: string }) => void }) =>
        h.onError({ code: 'crm.catalog.InUse' }),
    );
    byLabel(el, 'Delete Oak')!.click();
    await vi.waitFor(() => expect(confirmOpen).toHaveBeenCalledTimes(2));
    expect(confirmOpen.mock.calls[1][0].confirmLabel).toBe('Deactivate');
    await vi.waitFor(() =>
      expect(store.setActive).toHaveBeenCalledWith('items', 'I', false, expect.anything()),
    );
  });

  it('reads the options of a Select attribute (row 115) and renders them; the toggle flips includeInactive', () => {
    const attr = {
      id: 'A',
      categoryId: 'C',
      code: 'style',
      nameEn: 'Style',
      nameAr: 'Style',
      dataType: CatalogAttributeType.Select,
      unit: null,
      isRequired: false,
      sortOrder: 0,
      isActive: true,
      options: [],
    };
    const { el, fixture } = render({ effectiveAttributes: signal([attr]) });
    expect(store.loadOptions).toHaveBeenCalledWith('A');
    store.options.set({
      A: [
        {
          id: 'O1',
          code: 'm',
          nameEn: 'Modern',
          nameAr: 'Modern',
          imageUri: null,
          sortOrder: 0,
          isActive: false,
        },
      ],
    });
    fixture.detectChanges();
    expect(el.querySelectorAll('[data-testid="cat-option"]')).toHaveLength(1);
    expect(byLabel(el, 'Activate Modern')).toBeTruthy();
    (el.querySelector('[data-testid="cat-include-inactive"] button') as HTMLButtonElement).click();
    expect(store.setIncludeInactiveOptions).toHaveBeenCalledWith(true);
  });

  it('Unmap sends the picked space type (row 116)', () => {
    const { fixture } = render();
    const c = fixture.componentInstance;
    c.targetType.set('T1');
    c.unmapType(CATEGORY);
    expect(store.unmapSpaceType).toHaveBeenCalledWith('C', 'T1', expect.anything());
  });
});

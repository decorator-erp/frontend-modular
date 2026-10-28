import { TestBed } from '@angular/core/testing';
import { Subject, of } from 'rxjs';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { CrmCatalogService } from '../../data/crm-catalog.service';
import { ToastService } from '@platform/feedback/toast.service';
import { CatalogAttributeType } from '../../model/crm-enums';
import type { CatalogAttribute, CatalogItem, SpaceItem } from '../../model';
import { PERA_MODAL_DATA, PeraModalRef } from '@ds';
import { CatalogStore } from '../../stores/catalog.store';
import { SpacesStore } from '../../stores/spaces.store';
import {
  CrmEditItemAttributesDialogComponent,
  EditItemAttributesDialogData,
} from './edit-item-attributes-dialog.component';

function catalogItem(over: Partial<CatalogItem> = {}): CatalogItem {
  return {
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
    attributes: [],
    trackKey: 'item-1',
    ...over,
  };
}

function attribute(over: Partial<CatalogAttribute> = {}): CatalogAttribute {
  return {
    id: 'attr-1',
    categoryId: 'cat-1',
    code: 'finish',
    nameEn: 'Finish',
    nameAr: 'التشطيب',
    dataType: CatalogAttributeType.Text,
    unit: null,
    isRequired: false,
    sortOrder: 0,
    isActive: true,
    options: [],
    ...over,
  };
}

function spaceItem(over: Partial<SpaceItem> = {}): SpaceItem {
  return {
    id: 'row-1',
    spaceId: 'space-1',
    catalogItemId: 'item-1',
    nodeNameEn: 'Oak wardrobe',
    nodeNameAr: 'دولاب خشب',
    imageUri: null,
    isPurchasable: true,
    path: [],
    status: 1,
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
 * Regression coverage for the fix at edit-item-attributes-dialog.component.ts: backend `a7de73f`
 * made effective-attributes require a CATEGORY id, so this dialog must resolve categoryId via
 * the item cache before asking for definitions — and must do it REACTIVELY, because the item
 * can still be cold in `CatalogStore.itemsById` when the dialog opens (nothing guarantees the
 * board's own warm-up effect has resolved it first). Asserted through the rendered DOM, since
 * `defs`/`hasDefinitions` are protected — the spinner/empty-state/field split IS the contract
 * a caller of this dialog actually observes.
 */
describe('CrmEditItemAttributesDialogComponent — resolving categoryId reactively', () => {
  let getItem: ReturnType<typeof vi.fn>;
  let effectiveAttributes: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    getItem = vi.fn();
    effectiveAttributes = vi.fn().mockReturnValue(of([]));
  });

  function render(data: EditItemAttributesDialogData): HTMLElement {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [CrmEditItemAttributesDialogComponent],
      providers: [
        CatalogStore,
        { provide: CrmCatalogService, useValue: { getItem, effectiveAttributes } },
        { provide: SpacesStore, useValue: { setItemAttributes: vi.fn() } },
        { provide: ToastService, useValue: { show: () => undefined } },
        { provide: PeraModalRef, useValue: { close: () => undefined } },
        { provide: PERA_MODAL_DATA, useValue: data },
      ],
    });
    const fixture = TestBed.createComponent(CrmEditItemAttributesDialogComponent);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('a catalog row whose item lands LATE still populates — no silent empty form', () => {
    const itemSubject = new Subject<CatalogItem>();
    getItem.mockReturnValue(itemSubject.asObservable());
    effectiveAttributes.mockReturnValue(of([attribute()]));
    const el = render({ spaceId: 'space-1', item: spaceItem() });

    // Before the item arrives: a SPINNER (pending), never the "no attributes" empty state —
    // that empty state is what the bug this fix exists to kill would show instead.
    expect(el.querySelector('pera-spinner')).not.toBeNull();
    expect(el.textContent).not.toContain('No attributes');
    expect(effectiveAttributes).not.toHaveBeenCalled();

    // The item resolves late.
    itemSubject.next(catalogItem());
    TestBed.tick();

    expect(effectiveAttributes).toHaveBeenCalledWith('cat-1');
  });

  it('passes the CATEGORY id to effectiveAttributes, never the item id', () => {
    getItem.mockReturnValue(of(catalogItem({ id: 'item-1', categoryId: 'cat-lighting' })));
    render({ spaceId: 'space-1', item: spaceItem({ catalogItemId: 'item-1' }) });
    TestBed.tick();

    expect(effectiveAttributes).toHaveBeenCalledWith('cat-lighting');
    expect(effectiveAttributes).not.toHaveBeenCalledWith('item-1');
  });

  it('renders the field once effectiveAttributes resolves after the item', () => {
    getItem.mockReturnValue(of(catalogItem()));
    effectiveAttributes.mockReturnValue(of([attribute()]));
    const el = render({ spaceId: 'space-1', item: spaceItem() });
    TestBed.tick();

    expect(el.querySelector('pera-spinner')).toBeNull();
    expect(el.textContent).toContain('Finish');
  });

  it('a custom row issues NO item fetch and NO attributes fetch', () => {
    render({
      spaceId: 'space-1',
      item: spaceItem({
        catalogItemId: null,
        isCustom: true,
        customName: 'Vintage lamp',
        customCategoryId: 'cat-lighting',
      }),
    });
    TestBed.tick();

    expect(getItem).not.toHaveBeenCalled();
    expect(effectiveAttributes).not.toHaveBeenCalled();
  });
});

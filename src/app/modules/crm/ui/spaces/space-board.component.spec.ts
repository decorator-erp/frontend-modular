import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { CrmProvisionStatus } from '../../model/crm-enums';
import type { CrmSpace, CrmSpaceType, SpaceItem } from '../../model';
import { ToastService } from '@platform/feedback/toast.service';
import { ConfirmService, ModalService } from '@ds';
import { CatalogStore } from '../../stores/catalog.store';
import { SpacesStore } from '../../stores/spaces.store';
import { CrmSpaceBoardComponent } from './space-board.component';

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

function customRow(over: Partial<SpaceItem> = {}): SpaceItem {
  return {
    id: 'row-1',
    spaceId: 'space-1',
    catalogItemId: null,
    nodeNameEn: 'Vintage lamp',
    nodeNameAr: 'Vintage lamp',
    imageUri: null,
    isPurchasable: true,
    path: [],
    status: CrmProvisionStatus.ToBuy,
    note: null,
    sourceBriefSpaceId: null,
    attributes: [],
    isCustom: true,
    customName: 'Vintage lamp',
    customCategoryId: 'cat-lighting',
    trackKey: 'row-1',
    ...over,
  };
}

/**
 * `promote()` — the board's half of the promote flow (F6): opens the item dialog
 * pre-filled from the custom row, then repoints the row at whatever item the dialog
 * returns. The dialog's own generated-spec-fields behavior is covered by
 * `catalog-item-dialog.component.ts`'s own tests (none yet — new in this run, matching
 * the item dialog's own scope) — this only covers the hand-off on both sides.
 */
describe('CrmSpaceBoardComponent — promote()', () => {
  let promoteItem: ReturnType<typeof vi.fn>;
  let afterClosed: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    promoteItem = vi.fn();
    afterClosed = vi.fn().mockResolvedValue(null);

    TestBed.configureTestingModule({
      providers: [
        {
          provide: SpacesStore,
          useValue: { board: () => [], promoteItem, mutatingBySpace: () => ({}) },
        },
        { provide: CatalogStore, useValue: { loadItem: vi.fn(), item: () => undefined } },
        { provide: ConfirmService, useValue: { open: vi.fn() } },
        { provide: ModalService, useValue: { open: vi.fn(() => ({ afterClosed })) } },
        { provide: ToastService, useValue: { show: vi.fn() } },
      ],
    });
  });

  function make(): CrmSpaceBoardComponent {
    const fixture = TestBed.createComponent(CrmSpaceBoardComponent);
    fixture.componentRef.setInput('space', SPACE);
    fixture.detectChanges();
    return fixture.componentInstance;
  }

  it('is a no-op for a catalog row (never custom)', () => {
    const c = make();
    const modal = TestBed.inject(ModalService);
    c.promote(customRow({ isCustom: false, catalogItemId: 'item-1', customCategoryId: null }));
    expect(modal.open).not.toHaveBeenCalled();
  });

  it('is a no-op for a custom row missing its category (defensive — should not happen)', () => {
    const c = make();
    const modal = TestBed.inject(ModalService);
    c.promote(customRow({ customCategoryId: null }));
    expect(modal.open).not.toHaveBeenCalled();
  });

  it('opens the item dialog pre-filled with the category and typed name', () => {
    const c = make();
    const modal = TestBed.inject(ModalService);
    c.promote(customRow());

    expect(modal.open).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        data: { categoryId: 'cat-lighting', item: null, prefillName: 'Vintage lamp' },
      }),
    );
  });

  it('calls promoteItem with the id the dialog returns', async () => {
    afterClosed.mockResolvedValue('new-item-id');
    const c = make();
    c.promote(customRow());
    await Promise.resolve();
    await Promise.resolve();

    expect(promoteItem).toHaveBeenCalledWith('space-1', 'row-1', 'new-item-id', expect.anything());
  });

  it('does NOT call promoteItem when the dialog is cancelled (null)', async () => {
    afterClosed.mockResolvedValue(null);
    const c = make();
    c.promote(customRow());
    await Promise.resolve();
    await Promise.resolve();

    expect(promoteItem).not.toHaveBeenCalled();
  });
});

import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastService } from '@platform/feedback/toast.service';
import { CrmCatalogService } from '../data/crm-catalog.service';
import { CrmStorefrontService } from '../data/crm-storefront.service';
import type { CatalogAttribute, CatalogItem, SpaceSelection } from '../model';
import { StorefrontStore } from './storefront.store';

const pick = (id: string): SpaceSelection => ({
  id,
  spaceId: 'SP',
  catalogItemId: 'item',
  itemCode: id,
  itemNameEn: id,
  itemNameAr: id,
  quantity: 1,
  notes: null,
  sortOrder: 0,
  options: [],
});

const conflict = (code: string, status: number) =>
  new HttpErrorResponse({ status, error: { errors: { [code]: ['msg'] } } });

describe('StorefrontStore (crmp C-6)', () => {
  let api: Record<string, ReturnType<typeof vi.fn>>;
  let catalogApi: Record<string, ReturnType<typeof vi.fn>>;
  let toast: { show: ReturnType<typeof vi.fn> };
  let store: InstanceType<typeof StorefrontStore>;

  beforeEach(() => {
    api = {
      list: vi.fn().mockReturnValue(of([pick('a'), pick('b'), pick('c')])),
      add: vi.fn().mockReturnValue(of('new')),
      reorder: vi.fn().mockReturnValue(of(undefined)),
      remove: vi.fn().mockReturnValue(of(undefined)),
    };
    catalogApi = {
      treeForSpaceType: vi.fn().mockReturnValue(of([])),
      itemsByCategory: vi.fn().mockReturnValue(
        of([
          { id: 'i1', categoryId: 'c1', isActive: true },
          { id: 'i2', categoryId: 'c1', isActive: false },
        ] as CatalogItem[]),
      ),
      effectiveAttributes: vi.fn().mockReturnValue(
        of([
          { id: 'a1', isActive: true },
          { id: 'a2', isActive: true },
          { id: 'a3', isActive: false },
        ] as CatalogAttribute[]),
      ),
      attributeOptions: vi.fn((id: string) =>
        of(
          id === 'a1'
            ? [
                { id: 'o1', isActive: true },
                { id: 'o2', isActive: false },
              ]
            : [],
        ),
      ),
    };
    toast = { show: vi.fn() };
    TestBed.configureTestingModule({
      providers: [
        StorefrontStore,
        { provide: CrmStorefrontService, useValue: api },
        { provide: CrmCatalogService, useValue: catalogApi },
        { provide: ToastService, useValue: toast },
      ],
    });
    store = TestBed.inject(StorefrontStore);
    store.load('SP', 'ST');
  });

  it('loads the picks and the catalog tree filtered to the space type', () => {
    expect(api['list']).toHaveBeenCalledWith('SP');
    expect(catalogApi['treeForSpaceType']).toHaveBeenCalledWith('ST');
    expect(store.selections().map((s) => s.id)).toEqual(['a', 'b', 'c']);
  });

  it('a 404 on the list is the not-found state', () => {
    api['list'].mockReturnValue(throwError(() => new HttpErrorResponse({ status: 404 })));
    store.reload();
    expect(store.notFound()).toBe(true);
    expect(store.loadError()).toBeNull();
  });

  it('keeps only active items, active attributes with active options', () => {
    store.pickCategory('c1');
    expect(store.items().map((i) => i.id)).toEqual(['i1']);
    store.pickItem(store.items()[0]);
    expect(catalogApi['effectiveAttributes']).toHaveBeenCalledWith('c1');
    expect(store.attributes().map((c) => [c.attribute.id, c.options.map((o) => o.id)])).toEqual([
      ['a1', ['o1']],
    ]);
  });

  it('move sends EVERY selection id with the two swapped (route 112)', () => {
    store.move('b', -1);
    expect(api['reorder']).toHaveBeenCalledWith('SP', ['b', 'a', 'c']);
    expect(api['list']).toHaveBeenCalledTimes(2);
  });

  it('409 crm.storefront.ConcurrentUpdate reloads and toasts (injectReloadOnConflict)', () => {
    api['reorder'].mockReturnValue(
      throwError(() => conflict('crm.storefront.ConcurrentUpdate', 409)),
    );
    store.move('a', 1);
    expect(api['list']).toHaveBeenCalledTimes(2);
    expect(toast.show).toHaveBeenCalled();
    expect(store.saving()).toBe(false);
    expect(store.actionError()).toBeNull();
  });

  it('400 crm.storefront.InvalidOrder reloads and shows the catalog message', () => {
    api['reorder'].mockReturnValue(throwError(() => conflict('crm.storefront.InvalidOrder', 400)));
    store.move('a', 1);
    expect(api['list']).toHaveBeenCalledTimes(2);
    expect(store.actionError()).toBeTruthy();
  });

  it('a crm.storefront.* add error lands in actionError and reaches onError', () => {
    api['add'].mockReturnValue(
      throwError(() => conflict('crm.storefront.CategoryNotTargeted', 400)),
    );
    const onError = vi.fn();
    store.add({ catalogItemId: 'i1', quantity: 1 }, { onError });
    expect(onError.mock.calls[0][0].code).toBe('crm.storefront.CategoryNotTargeted');
    expect(store.actionError()).toBeTruthy();
  });

  it('remove deletes then reloads', () => {
    store.remove('b');
    expect(api['remove']).toHaveBeenCalledWith('SP', 'b');
    expect(api['list']).toHaveBeenCalledTimes(2);
  });
});

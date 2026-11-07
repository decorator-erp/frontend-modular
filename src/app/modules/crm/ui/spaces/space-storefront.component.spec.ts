import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ConfirmService } from '@ds';
import { PermissionsService } from '@platform/permissions/permissions.service';
import type { CrmSpace, SpaceSelection } from '../../model';
import { StorefrontStore } from '../../stores/storefront.store';
import { CrmSpaceStorefrontComponent, parseQuantity } from './space-storefront.component';

const SPACE: CrmSpace = {
  id: 'SP',
  projectId: 'P',
  spaceType: { id: 'ST', code: 'k', nameEn: 'Kitchen', nameAr: 'مطبخ' },
  name: 'Kitchen',
  sortOrder: 0,
  isActive: true,
  description: null,
};

const pick = (id: string, name: string): SpaceSelection => ({
  id,
  spaceId: 'SP',
  catalogItemId: 'item',
  itemCode: 'C',
  itemNameEn: name,
  itemNameAr: name,
  quantity: 2,
  notes: null,
  sortOrder: 0,
  options: [
    {
      attributeId: 'a',
      attributeNameEn: 'Fabric',
      attributeNameAr: 'قماش',
      optionId: 'o',
      optionCode: 'L',
      optionNameEn: 'Linen',
      optionNameAr: 'كتان',
    },
  ],
});

describe('CrmSpaceStorefrontComponent (crmp C-6)', () => {
  let perms: Set<string>;
  let store: Record<string, unknown> & {
    load: ReturnType<typeof vi.fn>;
    move: ReturnType<typeof vi.fn>;
    remove: ReturnType<typeof vi.fn>;
    add: ReturnType<typeof vi.fn>;
  };
  const confirmOpen = vi.fn();

  function render() {
    TestBed.configureTestingModule({
      imports: [CrmSpaceStorefrontComponent],
      providers: [
        { provide: PermissionsService, useValue: { can: (p: string) => perms.has(p) } },
        { provide: ConfirmService, useValue: { open: confirmOpen } },
      ],
    });
    TestBed.overrideComponent(CrmSpaceStorefrontComponent, {
      set: { providers: [{ provide: StorefrontStore, useValue: store }] },
    });
    const fixture = TestBed.createComponent(CrmSpaceStorefrontComponent);
    fixture.componentRef.setInput('space', SPACE);
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  beforeEach(() => {
    perms = new Set(['crm.spaces.read', 'crm.spaces.manage']);
    confirmOpen.mockReset();
    store = {
      load: vi.fn(),
      reload: vi.fn(),
      move: vi.fn(),
      remove: vi.fn(),
      add: vi.fn(),
      pickCategory: vi.fn(),
      pickItem: vi.fn(),
      selections: signal([pick('s1', 'Sofa'), pick('s2', 'Lamp')]),
      loading: signal(false),
      notFound: signal(false),
      loadError: signal(null),
      saving: signal(false),
      actionError: signal(null),
      categories: signal([]),
      items: signal([]),
      attributes: signal([]),
      pickerLoading: signal(false),
      pickerError: signal(null),
    };
  });

  it('loads the space with its type and lists the picks with their options', () => {
    const { el } = render();
    expect(store.load).toHaveBeenCalledWith('SP', 'ST');
    expect(el.querySelectorAll('[data-selection]')).toHaveLength(2);
    expect(el.textContent).toContain('Fabric');
    expect(el.textContent).toContain('Linen');
  });

  it('move up/down and remove are labelled buttons; the edges are disabled', async () => {
    const { el } = render();
    const byLabel = (l: string) =>
      el.querySelector(`button[aria-label="${l}"]`) as HTMLButtonElement | null;
    expect(byLabel('Move Sofa up')?.disabled).toBe(true);
    expect(byLabel('Move Lamp down')?.disabled).toBe(true);
    byLabel('Move Lamp up')!.click();
    expect(store.move).toHaveBeenCalledWith('s2', -1);
    confirmOpen.mockResolvedValue(true);
    byLabel('Remove Sofa')!.click();
    await vi.waitFor(() => expect(store.remove).toHaveBeenCalledWith('s1'));
  });

  it('hides every write without crm.spaces.manage (reads crm.spaces.read)', () => {
    perms = new Set(['crm.spaces.read']);
    const { el } = render();
    expect(el.querySelectorAll('[data-selection]')).toHaveLength(2);
    expect(el.querySelector('[data-add-form]')).toBeNull();
    expect(el.querySelectorAll('button[aria-label]')).toHaveLength(0);
  });

  it('without crm.spaces.read shows no picks and loads nothing', () => {
    perms = new Set();
    const { el } = render();
    expect(store.load).not.toHaveBeenCalled();
    expect(el.querySelector('[data-picks]')).toBeNull();
  });

  it('shows the not-found state on a 404', () => {
    (store['notFound'] as ReturnType<typeof signal<boolean>>).set(true);
    const { el } = render();
    expect(el.textContent).toContain('This space was not found.');
  });

  it('parseQuantity: 0.001..1,000,000 with at most 3 decimals', () => {
    expect(parseQuantity('1')).toBe(1);
    expect(parseQuantity('0.001')).toBe(0.001);
    expect(parseQuantity('1000000')).toBe(1_000_000);
    expect(parseQuantity('0')).toBeNull();
    expect(parseQuantity('1.2345')).toBeNull();
    expect(parseQuantity('1000000.001')).toBeNull();
    expect(parseQuantity('-1')).toBeNull();
    expect(parseQuantity('abc')).toBeNull();
  });
});

import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { afterEach, describe, expect, it } from 'vitest';
import { ToastService } from '@platform/feedback/toast.service';
import { PERA_MODAL_DATA, PeraModalRef } from '@ds';
import { environment } from '../../../../../../environments/environment';
import { CatalogAttributeType, CatalogSelectionMode } from '../../../model/crm-enums';
import { CrmCatalogItemDialogComponent } from './catalog-item-dialog.component';

const url = (path: string) => `${environment.apiUrl}${path}`;

const CATEGORY = {
  id: 'C',
  parentId: null,
  code: 'c',
  nameEn: 'Cat',
  nameAr: 'Cat',
  selectionMode: CatalogSelectionMode.None,
  isRequired: false,
  sortOrder: 0,
  path: '/C/',
  depth: 0,
  isActive: true,
};

const DETAIL = {
  id: 'I',
  categoryId: 'C',
  code: 'lamp',
  nameEn: 'Lamp',
  nameAr: 'مصباح',
  isPurchasable: false,
  sortOrder: 0,
  isActive: true,
  descriptionEn: 'Brass desk lamp',
  descriptionAr: null,
  imageUri: 'https://cdn.example/lamp.png',
  attributeValues: [{ attributeId: 'style', optionId: 'o-modern' }],
};

/** Sync F4f: the item dialog's edit mode (S9 description/image, S10 item read). */
describe('CrmCatalogItemDialogComponent — edit mode (sync F4f)', () => {
  let http: HttpTestingController;
  let closedWith: unknown;

  function render(detail: Record<string, unknown> | null) {
    closedWith = undefined;
    TestBed.configureTestingModule({
      imports: [CrmCatalogItemDialogComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: ToastService, useValue: { show: () => undefined } },
        { provide: PeraModalRef, useValue: { close: (r: unknown) => (closedWith = r) } },
        { provide: PERA_MODAL_DATA, useValue: { categoryId: 'C', itemId: 'I' } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(CrmCatalogItemDialogComponent);
    fixture.detectChanges();
    const item = http.expectOne(url('/crm/catalog/items/I'));
    if (detail) item.flush(detail);
    else item.flush(null, { status: 404, statusText: 'Not Found' });
    http.expectOne(url('/crm/catalog/tree')).flush([CATEGORY]);
    http.expectOne(url('/crm/catalog/categories/C/attributes')).flush([
      {
        id: 'style',
        categoryId: 'C',
        code: 'style',
        nameEn: 'Style',
        nameAr: 'Style',
        dataType: CatalogAttributeType.Select,
        unit: null,
        isRequired: false,
        sortOrder: 0,
        isActive: true,
      },
    ]);
    fixture.detectChanges();
    // Sync F4f: the Select attribute reads its options.
    http.expectOne((r) => r.url === url('/crm/catalog/attributes/style/options')).flush([]);
    fixture.detectChanges();
    return fixture;
  }

  afterEach(() => http.verify());

  it('reads the item, shows its identity read-only with the description and image', () => {
    const fixture = render(DETAIL);
    const c = fixture.componentInstance;
    expect(c.isEdit).toBe(true);
    expect(c.form.disabled).toBe(true);
    expect(c.form.getRawValue()).toEqual({
      code: 'lamp',
      nameEn: 'Lamp',
      nameAr: 'مصباح',
      isPurchasable: false,
    });
    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('[data-testid="cat-item-description"]')?.textContent).toContain(
      'Brass desk lamp',
    );
    expect(el.querySelector('[data-testid="cat-item-image"]')?.getAttribute('src')).toBe(
      'https://cdn.example/lamp.png',
    );
  });

  it('saves the seeded spec values through the replace-all route, never a create', () => {
    const fixture = render(DETAIL);
    fixture.componentInstance.submit();
    const put = http.expectOne(url('/crm/catalog/items/I/attribute-values'));
    expect(put.request.method).toBe('PUT');
    expect(put.request.body).toEqual({
      values: [
        {
          attributeId: 'style',
          valueText: null,
          valueNumber: null,
          valueBool: null,
          valueDate: null,
          optionId: 'o-modern',
        },
      ],
    });
    put.flush(null);
    http.expectNone(url('/crm/catalog/items'));
    expect(closedWith).toBe('I');
  });

  it('a missing item (404) shows the load error and saves nothing', () => {
    const fixture = render(null);
    fixture.componentInstance.submit();
    expect(fixture.nativeElement.textContent).toContain('Could not load this item.');
  });

  it('an item without S9 fields shows "No description" and no image', () => {
    const fixture = render({ ...DETAIL, descriptionEn: undefined, imageUri: undefined });
    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('[data-testid="cat-item-description"]')?.textContent).toContain(
      'No description',
    );
    expect(el.querySelector('[data-testid="cat-item-image"]')).toBeNull();
  });
});

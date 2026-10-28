import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { afterEach, describe, expect, it } from 'vitest';
import { ToastService } from '@platform/feedback/toast.service';
import { PERA_MODAL_DATA, PeraModalRef } from '@ds';
import { environment } from '../../../../../../environments/environment';
import { CatalogAttributeType, CatalogSelectionMode } from '../../../model/crm-enums';
import {
  CatalogItemDialogData,
  CrmCatalogItemDialogComponent,
} from './catalog-item-dialog.component';

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

const attr = (id: string, dataType: CatalogAttributeType) => ({
  id,
  categoryId: 'C',
  code: id,
  nameEn: id,
  nameAr: id,
  dataType,
  unit: null,
  isRequired: false,
  sortOrder: 0,
  isActive: true,
});

describe('CrmCatalogItemDialogComponent (009b #36, #38)', () => {
  let http: HttpTestingController;

  function render(data: CatalogItemDialogData) {
    TestBed.configureTestingModule({
      imports: [CrmCatalogItemDialogComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: ToastService, useValue: { show: () => undefined } },
        { provide: PeraModalRef, useValue: { close: () => undefined } },
        { provide: PERA_MODAL_DATA, useValue: data },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(CrmCatalogItemDialogComponent);
    fixture.detectChanges();
    http.expectOne(url('/crm/catalog/tree')).flush([CATEGORY]);
    // Select only: the non-Select spec controls bind `[formControlName]` inside the outer
    // `form`, not `specForm` — an old-app bug (verbatim), out of this row.
    http
      .expectOne(url('/crm/catalog/categories/C/attributes'))
      .flush([attr('style', CatalogAttributeType.Select)]);
    fixture.detectChanges();
    return fixture;
  }

  afterEach(() => http.verify());

  it('loads the spec fields from the categories route and marks a Select "not available"', () => {
    const el = render({ categoryId: 'C' }).nativeElement as HTMLElement;
    const unavailable = el.querySelectorAll('[data-testid="cat-options-unavailable"]');
    expect(unavailable).toHaveLength(1);
    expect(unavailable[0].textContent).toContain('Not available yet.');
  });

  it('creates without description or image and writes the specs to the returned id (009b #38)', () => {
    const fixture = render({ categoryId: 'C' });
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('pera-textarea')).toBeNull();

    const dialog = fixture.componentInstance;
    dialog.form.patchValue({ code: 'oak', nameEn: 'Oak', nameAr: 'بلوط' });
    dialog.submit();

    const create = http.expectOne(url('/crm/catalog/items'));
    expect(create.request.body).toEqual({
      categoryId: 'C',
      code: 'oak',
      nameEn: 'Oak',
      nameAr: 'بلوط',
      isPurchasable: true,
      sortOrder: 0,
    });
    create.flush({ itemId: 'I' });

    const specs = http.expectOne(url('/crm/catalog/items/I/attribute-values'));
    expect(specs.request.method).toBe('PUT');
    specs.flush(null);
  });

  // 009b #N-9: no item update route — the dialog only creates, whatever it is handed.
  it('is create-only, even when handed an item (009b #N-9)', () => {
    const fixture = render({ categoryId: 'C', item: { id: 'OLD' } } as CatalogItemDialogData);
    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('New item');
    expect(el.textContent).not.toContain('Edit item');

    const dialog = fixture.componentInstance;
    dialog.form.patchValue({ code: 'oak', nameEn: 'Oak', nameAr: 'بلوط' });
    dialog.submit();

    http.expectOne(url('/crm/catalog/items')).flush({ itemId: 'I' });
    http.expectOne(url('/crm/catalog/items/I/attribute-values')).flush(null);
  });
});

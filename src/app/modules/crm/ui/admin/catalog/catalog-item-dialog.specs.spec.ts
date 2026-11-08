import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { afterEach, describe, expect, it } from 'vitest';
import { ToastService } from '@platform/feedback/toast.service';
import { PERA_MODAL_DATA, PeraModalRef } from '@ds';
import { environment } from '../../../../../../environments/environment';
import { CatalogAttributeType, CatalogSelectionMode } from '../../../model/crm-enums';
import { CrmCatalogItemDialogComponent } from './catalog-item-dialog.component';

/**
 * Sync F4f follow-up: the spec controls bind to `specForm` (they sat inside the outer `form`,
 * so Number/Text/Bool/Date could never be edited), and a Select attribute reads its options from
 * `GET /crm/catalog/attributes/{id}/options` instead of showing "not available".
 */
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

const value = (v: Record<string, unknown>) => ({
  valueText: null,
  valueNumber: null,
  valueBool: null,
  valueDate: null,
  optionId: null,
  ...v,
});

describe('CrmCatalogItemDialogComponent spec values (sync F4f)', () => {
  let http: HttpTestingController;

  function render() {
    TestBed.configureTestingModule({
      imports: [CrmCatalogItemDialogComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: ToastService, useValue: { show: () => undefined } },
        { provide: PeraModalRef, useValue: { close: () => undefined } },
        { provide: PERA_MODAL_DATA, useValue: { categoryId: 'C' } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(CrmCatalogItemDialogComponent);
    fixture.detectChanges();
    http.expectOne(url('/crm/catalog/tree')).flush([CATEGORY]);
    http
      .expectOne(url('/crm/catalog/categories/C/attributes'))
      .flush([
        attr('width', CatalogAttributeType.Number),
        attr('finish', CatalogAttributeType.Text),
        attr('style', CatalogAttributeType.Select),
      ]);
    fixture.detectChanges();
    return fixture;
  }

  afterEach(() => http.verify());

  it('renders every spec control bound to specForm and loads Select options', () => {
    const fixture = render();
    const options = http.expectOne((r) => r.url === url('/crm/catalog/attributes/style/options'));
    options.flush([
      {
        id: 'O1',
        code: 'modern',
        nameEn: 'Modern',
        nameAr: 'حديث',
        imageUri: null,
        sortOrder: 0,
        isActive: true,
      },
    ]);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('[data-testid="cat-options-unavailable"]')).toBeNull();
    const dialog = fixture.componentInstance;
    expect(dialog.specForm.contains('width')).toBe(true);
    expect(el.querySelector('pera-select')).not.toBeNull();
    expect(
      (dialog as unknown as { optionsFor(id: string): { label: string }[] })
        .optionsFor('style')
        .map((o) => o.label),
    ).toEqual(['—', 'Modern']);
  });

  it('writes the edited Number, Text and Select values', () => {
    const fixture = render();
    http
      .expectOne((r) => r.url === url('/crm/catalog/attributes/style/options'))
      .flush([
        {
          id: 'O1',
          code: 'modern',
          nameEn: 'Modern',
          nameAr: 'حديث',
          imageUri: null,
          sortOrder: 0,
          isActive: true,
        },
      ]);
    fixture.detectChanges();
    const dialog = fixture.componentInstance;
    const el = fixture.nativeElement as HTMLElement;
    const input = el.querySelector<HTMLInputElement>(
      'pera-input[type="number"] input, input[type="number"]',
    );
    expect(input).not.toBeNull();
    input!.value = '120';
    input!.dispatchEvent(new Event('input'));
    dialog.specForm.get('finish')!.setValue('Oak');
    dialog.specForm.get('style')!.setValue('O1');
    dialog.form.patchValue({ code: 'oak', nameEn: 'Oak', nameAr: 'بلوط' });
    dialog.submit();

    http.expectOne(url('/crm/catalog/items')).flush({ itemId: 'I' });
    const specs = http.expectOne(url('/crm/catalog/items/I/attribute-values'));
    expect(specs.request.body).toEqual({
      values: [
        value({ attributeId: 'width', valueNumber: 120 }),
        value({ attributeId: 'finish', valueText: 'Oak' }),
        value({ attributeId: 'style', optionId: 'O1' }),
      ],
    });
    specs.flush(null);
  });
});

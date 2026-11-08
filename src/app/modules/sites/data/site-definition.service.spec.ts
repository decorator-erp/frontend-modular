import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { environment } from '../../../../environments/environment';
import { SiteDefinitionService } from './site-definition.service';

// sites S-1: D1–D20, dms Sites.Infrastructure/Endpoints/SiteDefinitionEndpoints.cs.
describe('SiteDefinitionService (sites S-1)', () => {
  let service: SiteDefinitionService;
  let http: HttpTestingController;
  const url = (path: string) => `${environment.apiUrl}${path}`;
  const noContent = { status: 204, statusText: 'No Content' };
  const created = { status: 201, statusText: 'Created' };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [SiteDefinitionService, provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(SiteDefinitionService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('D1 GET /site-modules (includeInactive only when true)', () => {
    let mods: unknown;
    service.modules().subscribe((m) => (mods = m));
    const a = http.expectOne((r) => r.url === url('/site-modules'));
    expect(a.request.params.has('includeInactive')).toBe(false);
    a.flush([
      {
        id: 'M1',
        code: 'DOORS',
        nameEn: 'Doors',
        nameAr: 'الأبواب',
        descriptionEn: null,
        descriptionAr: null,
        isSystem: true,
        sortOrder: 1,
        isActive: true,
      },
    ]);
    expect(mods).toMatchObject([{ id: 'M1', code: 'DOORS', isSystem: true }]);
    service.modules(true).subscribe();
    const b = http.expectOne((r) => r.url === url('/site-modules'));
    expect(b.request.params.get('includeInactive')).toBe('true');
    b.flush([]);
  });

  it('D2 GET /site-modules/{code}/schema → fields with int dataType and options', () => {
    let schema: unknown;
    service.schema('DOORS').subscribe((s) => (schema = s));
    http.expectOne(url('/site-modules/DOORS/schema')).flush({
      moduleId: 'M1',
      code: 'DOORS',
      nameEn: 'Doors',
      nameAr: 'الأبواب',
      sortOrder: 1,
      fields: [
        {
          linkId: 'L1',
          itemId: 'I1',
          code: 'kind',
          nameEn: 'Kind',
          nameAr: 'النوع',
          dataType: 4,
          tolerance: 0,
          isRequired: true,
          isVisible: true,
          sortOrder: 1,
          options: [
            {
              id: 'O1',
              code: 'single',
              nameEn: 'Single',
              nameAr: 'مفرد',
              sortOrder: 1,
              isActive: true,
            },
          ],
        },
      ],
    });
    expect(schema).toMatchObject({
      moduleId: 'M1',
      fields: [{ itemId: 'I1', dataType: 4, options: [{ id: 'O1' }] }],
    });
  });

  it('D3 POST /site-modules → { moduleId }', () => {
    let id = '';
    service.createModule({ code: 'AC', nameEn: 'AC', nameAr: 'تكييف' }).subscribe((x) => (id = x));
    const req = http.expectOne(url('/site-modules'));
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({
      code: 'AC',
      nameEn: 'AC',
      nameAr: 'تكييف',
      descriptionEn: null,
      descriptionAr: null,
      sortOrder: 0,
    });
    req.flush({ moduleId: 'M2' }, created);
    expect(id).toBe('M2');
  });

  it('D4 PUT /site-modules/{id}', () => {
    const body = {
      nameEn: 'A',
      nameAr: 'ب',
      descriptionEn: null,
      descriptionAr: null,
      sortOrder: 3,
    };
    service.updateModule('M1', body).subscribe();
    const req = http.expectOne(url('/site-modules/M1'));
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual(body);
    req.flush(null, noContent);
  });

  it('D5 DELETE /site-modules/{id}', () => {
    service.deleteModule('M1').subscribe();
    const req = http.expectOne(url('/site-modules/M1'));
    expect(req.request.method).toBe('DELETE');
    req.flush(null, noContent);
  });

  it.each([
    ['D6', 'setModuleActive', '/site-modules/M1/active?isActive=false'],
    ['D14', 'setOptionActive', '/site-items/options/M1/active?isActive=false'],
    ['D19', 'setItemActive', '/site-items/M1/active?isActive=false'],
  ] as const)('%s PUT …/active?isActive=, no body', (_n, m, path) => {
    service[m]('M1', false).subscribe();
    const req = http.expectOne(url(path));
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toBeNull();
    req.flush(null, noContent);
  });

  it('D7 POST /site-modules/{id}/items → { linkId }', () => {
    let id = '';
    service.attachItem('M1', { itemId: 'I1' }).subscribe((x) => (id = x));
    const req = http.expectOne(url('/site-modules/M1/items'));
    expect(req.request.body).toEqual({
      itemId: 'I1',
      isRequired: false,
      isVisible: true,
      sortOrder: 0,
    });
    req.flush({ linkId: 'L9' }, created);
    expect(id).toBe('L9');
  });

  it('D8 PUT /site-modules/{id}/items/reorder { order }', () => {
    const order = [
      { itemId: 'I2', sortOrder: 1 },
      { itemId: 'I1', sortOrder: 2 },
    ];
    service.reorderItems('M1', order).subscribe();
    const req = http.expectOne(url('/site-modules/M1/items/reorder'));
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({ order });
    req.flush(null, noContent);
  });

  it('D9 PUT /site-modules/{id}/items/{itemId} with all three link fields', () => {
    service
      .updateLink('M1', 'I1', { isRequired: true, isVisible: false, sortOrder: 4 })
      .subscribe();
    const req = http.expectOne(url('/site-modules/M1/items/I1'));
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({ isRequired: true, isVisible: false, sortOrder: 4 });
    req.flush(null, noContent);
  });

  it('D10 DELETE /site-modules/{id}/items/{itemId}', () => {
    service.detachItem('M1', 'I1').subscribe();
    const req = http.expectOne(url('/site-modules/M1/items/I1'));
    expect(req.request.method).toBe('DELETE');
    req.flush(null, noContent);
  });

  it('D11 GET /site-items → items with options', () => {
    let items: unknown;
    service.items(true).subscribe((x) => (items = x));
    const req = http.expectOne((r) => r.url === url('/site-items'));
    expect(req.request.params.get('includeInactive')).toBe('true');
    req.flush([
      {
        id: 'I1',
        code: 'width_cm',
        nameEn: 'Width',
        nameAr: 'العرض',
        dataType: 'Number',
        unit: 'cm',
        minValue: 1,
        maxValue: null,
        tolerance: 2,
        maxLength: null,
        regexPattern: null,
        isSystem: false,
        isActive: true,
        options: [],
      },
    ]);
    expect(items).toMatchObject([{ id: 'I1', dataType: 1, minValue: 1, maxValue: null }]);
  });

  it('D12 POST /site-items → { itemId }', () => {
    let id = '';
    service
      .createItem({ code: 'kind', nameEn: 'Kind', nameAr: 'النوع', dataType: 4 })
      .subscribe((x) => (id = x));
    const req = http.expectOne(url('/site-items'));
    expect(req.request.body).toEqual({
      code: 'kind',
      nameEn: 'Kind',
      nameAr: 'النوع',
      dataType: 4,
      unit: null,
      minValue: null,
      maxValue: null,
      tolerance: 0,
      maxLength: null,
      regexPattern: null,
    });
    req.flush({ itemId: 'I9' }, created);
    expect(id).toBe('I9');
  });

  it('D13 PUT /site-items/options/{optionId}', () => {
    service.updateOption('O1', { nameEn: 'A', nameAr: 'ب', sortOrder: 2 }).subscribe();
    const req = http.expectOne(url('/site-items/options/O1'));
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({ nameEn: 'A', nameAr: 'ب', sortOrder: 2 });
    req.flush(null, noContent);
  });

  it('D15 GET /site-items/{id}/usage', () => {
    let u: unknown;
    service.usage('I1').subscribe((x) => (u = x));
    http.expectOne(url('/site-items/I1/usage')).flush({
      itemId: 'I1',
      code: 'width_cm',
      hasCapturedValues: true,
      capturedValueCount: 12,
      modules: [{ moduleId: 'M1', code: 'DOORS', isRequired: true, isActive: false }],
    });
    expect(u).toMatchObject({ capturedValueCount: 12, modules: [{ isActive: false }] });
  });

  it('D16 PUT /site-items/{id}', () => {
    const body = {
      nameEn: 'W',
      nameAr: 'ع',
      minValue: 1,
      maxValue: 5,
      maxLength: null,
      regexPattern: null,
    };
    service.updateItem('I1', body).subscribe();
    const req = http.expectOne(url('/site-items/I1'));
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual(body);
    req.flush(null, noContent);
  });

  it('D17 PUT /site-items/{id}/shape', () => {
    const body = { code: 'w', dataType: 1 as const, unit: 'cm', tolerance: 1 };
    service.changeShape('I1', body).subscribe();
    const req = http.expectOne(url('/site-items/I1/shape'));
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual(body);
    req.flush(null, noContent);
  });

  it('D18 DELETE /site-items/{id}', () => {
    service.deleteItem('I1').subscribe();
    const req = http.expectOne(url('/site-items/I1'));
    expect(req.request.method).toBe('DELETE');
    req.flush(null, noContent);
  });

  it('D20 POST /site-items/{itemId}/options → { optionId }', () => {
    let id = '';
    service
      .addOption('I1', { code: 'single', nameEn: 'S', nameAr: 'م' })
      .subscribe((x) => (id = x));
    const req = http.expectOne(url('/site-items/I1/options'));
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ code: 'single', nameEn: 'S', nameAr: 'م', sortOrder: 0 });
    req.flush({ optionId: 'O9' }, created);
    expect(id).toBe('O9');
  });
});

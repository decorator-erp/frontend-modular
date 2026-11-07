import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { BehaviorSubject, of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ConfirmService, DrawerService, ModalService } from '@ds';
import { ToastService } from '@platform/feedback/toast.service';
import { SiteDefinitionService } from '../../data/site-definition.service';
import type { SiteItem, SiteModule } from '../../model/site-definition.model';
import { FIELDS } from '../../testing/site-fixtures';
import type { DefFormData } from '../definitions/site-def-form-dialog.component';
import type { SiteItemDrawerData } from '../definitions/site-item-drawer.component';
import { SiteDefinitionsComponent } from './site-definitions.component';
import { SiteModuleDetailComponent } from './site-module-detail.component';

@Component({ template: '' })
class BlankComponent {}

const mod = (patch: Partial<SiteModule>): SiteModule => ({
  id: 'M1',
  code: 'DOORS',
  nameEn: 'Doors',
  nameAr: 'أبواب',
  descriptionEn: 'Every door',
  descriptionAr: null,
  isSystem: false,
  sortOrder: 1,
  isActive: true,
  ...patch,
});
const itm = (patch: Partial<SiteItem>): SiteItem => ({
  id: 'I-width_cm',
  code: 'width_cm',
  nameEn: 'Width',
  nameAr: 'العرض',
  dataType: 1,
  unit: 'cm',
  minValue: 10,
  maxValue: 400,
  tolerance: 0,
  maxLength: null,
  regexPattern: null,
  isSystem: true,
  isActive: true,
  options: [],
  ...patch,
});

const conflict = (code: string, status = 409) =>
  throwError(
    () => new HttpErrorResponse({ status, error: { title: code, errors: { [code]: ['no'] } } }),
  );

function setup(query: Record<string, string> = {}, params: Record<string, string> = {}) {
  const api: Record<string, ReturnType<typeof vi.fn>> = {
    modules: vi.fn(() =>
      of([
        mod({}),
        mod({ id: 'M2', code: 'WIN', nameEn: 'Windows', sortOrder: 2, isActive: false }),
      ]),
    ),
    items: vi.fn(() =>
      of([
        itm({}),
        itm({
          id: 'I-kind',
          code: 'kind',
          nameEn: 'Kind',
          dataType: 4,
          isSystem: false,
          unit: null,
          options: [],
        }),
        itm({
          id: 'I-free',
          code: 'free',
          nameEn: 'Free',
          dataType: 2,
          isSystem: false,
          unit: null,
        }),
      ]),
    ),
    schema: vi.fn(() =>
      of({
        moduleId: 'M1',
        code: 'DOORS',
        nameEn: 'Doors',
        nameAr: 'أبواب',
        sortOrder: 1,
        fields: FIELDS,
      }),
    ),
    usage: vi.fn((id: string) =>
      of({
        itemId: id,
        code: id,
        hasCapturedValues: id === 'I-width_cm',
        capturedValueCount: id === 'I-width_cm' ? 7 : 0,
        modules:
          id === 'I-free'
            ? []
            : [{ moduleId: 'M1', code: 'DOORS', isRequired: true, isActive: true }],
      }),
    ),
    createModule: vi.fn(() => of('M9')),
    updateModule: vi.fn(() => of(undefined)),
    deleteModule: vi.fn(() => of(undefined)),
    setModuleActive: vi.fn(() => of(undefined)),
    updateLink: vi.fn(() => of(undefined)),
    reorderItems: vi.fn(() => of(undefined)),
    detachItem: vi.fn(() => of(undefined)),
    attachItem: vi.fn(() => of('L9')),
    createItem: vi.fn(() => of('I9')),
    updateItem: vi.fn(() => of(undefined)),
    changeShape: vi.fn(() => of(undefined)),
    deleteItem: vi.fn(() => of(undefined)),
    setItemActive: vi.fn(() => of(undefined)),
    addOption: vi.fn(() => of('O9')),
    updateOption: vi.fn(() => of(undefined)),
    setOptionActive: vi.fn(() => of(undefined)),
  };
  const modalOpen = vi.fn(() => ({
    afterClosed: () => Promise.resolve(undefined),
    close: vi.fn(),
  }));
  const drawerOpen = vi.fn(() => ({ close: vi.fn() }));
  const confirmOpen = vi.fn(() => Promise.resolve(true));
  const toast = { show: vi.fn() };
  const q = new BehaviorSubject(convertToParamMap(query));
  TestBed.configureTestingModule({
    providers: [
      provideRouter([{ path: '**', component: BlankComponent }]),
      {
        provide: ActivatedRoute,
        useValue: {
          queryParamMap: q,
          paramMap: of(convertToParamMap(params)),
          snapshot: { queryParamMap: q.value },
        },
      },
      { provide: SiteDefinitionService, useValue: api },
      { provide: ModalService, useValue: { open: modalOpen } },
      { provide: DrawerService, useValue: { open: drawerOpen } },
      { provide: ConfirmService, useValue: { open: confirmOpen } },
      { provide: ToastService, useValue: toast },
    ],
  });
  return { api, modalOpen, drawerOpen, confirmOpen, toast };
}
const tick = () => new Promise((r) => setTimeout(r));
const formOf = (m: ReturnType<typeof vi.fn>, n = 0) =>
  (m.mock.calls[n] as unknown[])[1] as { data: DefFormData };

describe('SiteDefinitionsComponent (sites S-10)', () => {
  let h: ReturnType<typeof setup>;
  beforeEach(() => (h = setup()));

  it('modules tab: counts in tabs, code + System chip, names EN/AR, field count from the schema, status', () => {
    const fx = TestBed.createComponent(SiteDefinitionsComponent);
    fx.detectChanges();
    const el = fx.nativeElement as HTMLElement;
    expect(el.textContent).toContain('Modules 2');
    expect(el.textContent).toContain('Items 3');
    const row = el.querySelector('[data-module="DOORS"]')!;
    expect(row.textContent).toContain('أبواب');
    expect(row.querySelector('[data-fields-count]')?.textContent?.trim()).toBe('4');
    expect(el.querySelector('[data-module="WIN"] [data-fields-count]')?.textContent?.trim()).toBe(
      '—',
    );
    expect(h.api['schema']).toHaveBeenCalledTimes(1); // inactive WIN has no schema
  });

  it('Show inactive re-reads with includeInactive=true; search filters client-side', async () => {
    const fx = TestBed.createComponent(SiteDefinitionsComponent);
    fx.detectChanges();
    expect(h.api['modules']).toHaveBeenLastCalledWith(false);
    fx.componentInstance['store'].setIncludeInactive(true);
    expect(h.api['modules']).toHaveBeenLastCalledWith(true);
    expect(h.api['items']).toHaveBeenLastCalledWith(true);
    fx.componentInstance['query'].set('win');
    fx.detectChanges();
    const el = fx.nativeElement as HTMLElement;
    expect(el.querySelector('[data-module="DOORS"]')).toBeNull();
    expect(el.querySelector('[data-module="WIN"]')).toBeTruthy();
  });

  it('New module → D3, then the module page; CodeTaken comes back inline', async () => {
    const fx = TestBed.createComponent(SiteDefinitionsComponent);
    fx.detectChanges();
    (fx.nativeElement.querySelector('[data-new-module] button') as HTMLButtonElement).click();
    const data = formOf(h.modalOpen).data;
    const v = { ...data.initial, code: 'STAIRS', nameEn: 'Stairs', nameAr: 'سلالم' };
    expect((await data.save(v)).ok).toBe(true);
    expect(h.api['createModule']).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'STAIRS', sortOrder: 3 }),
    );
    h.api['createModule'].mockReturnValue(conflict('sites.CodeTaken'));
    const out = await data.save(v);
    expect(out.ok).toBe(false);
    expect(out.code).toBe('sites.CodeTaken');
  });

  it('items tab: type chip + unit, limits, used in / captured from usage; a row opens the drawer', () => {
    h = (TestBed.resetTestingModule(), setup({ tab: 'items' }));
    const fx = TestBed.createComponent(SiteDefinitionsComponent);
    fx.detectChanges();
    const el = fx.nativeElement as HTMLElement;
    const row = el.querySelector('[data-item="width_cm"]')!;
    expect(row.textContent).toContain('Number');
    expect(row.querySelector('[data-limits]')?.textContent).toContain('10 – 400');
    expect(row.querySelector('[data-used-in]')?.textContent).toContain('DOORS');
    expect(row.querySelector('[data-captured]')?.textContent?.trim()).toBe('7');
    expect(el.querySelector('[data-item="free"] [data-used-in]')?.textContent?.trim()).toBe('—');
    (row.querySelector('[data-open-item]') as HTMLButtonElement).click();
    const data = (h.drawerOpen.mock.calls[0] as unknown[])[1] as { data: SiteItemDrawerData };
    expect(data.data.itemId).toBe('I-width_cm');
  });

  it('drawer actions: change shape warns ItemLocked when values exist; delete refused (ItemInUse) toasts the reason', async () => {
    h = (TestBed.resetTestingModule(), setup({ tab: 'items' }));
    const fx = TestBed.createComponent(SiteDefinitionsComponent);
    fx.detectChanges();
    (
      fx.nativeElement.querySelector('[data-item="width_cm"] [data-open-item]') as HTMLButtonElement
    ).click();
    const d = ((h.drawerOpen.mock.calls[0] as unknown[])[1] as { data: SiteItemDrawerData }).data;
    const width = fx.componentInstance['store'].items()!.find((i) => i.code === 'width_cm')!;
    d.shape(width);
    expect(formOf(h.modalOpen).data.note).toContain('nothing has been captured');
    h.api['deleteItem'].mockReturnValue(conflict('sites.ItemInUse'));
    d.remove(width);
    await tick();
    await tick();
    expect(h.api['deleteItem']).toHaveBeenCalledWith('I-width_cm');
    expect(h.toast.show).toHaveBeenCalledWith(expect.objectContaining({ tone: 'warning' }));
  });

  it('A5: a refused item or option toggle shows the catalog message', async () => {
    h = (TestBed.resetTestingModule(), setup({ tab: 'items' }));
    const fx = TestBed.createComponent(SiteDefinitionsComponent);
    fx.detectChanges();
    (
      fx.nativeElement.querySelector('[data-item="kind"] [data-open-item]') as HTMLButtonElement
    ).click();
    const d = ((h.drawerOpen.mock.calls[0] as unknown[])[1] as { data: SiteItemDrawerData }).data;
    const kind = fx.componentInstance['store'].items()!.find((i) => i.code === 'kind')!;
    h.api['setItemActive'].mockReturnValue(conflict('sites.ItemNotFound', 404));
    d.toggleActive(kind);
    await tick();
    await tick();
    expect(h.toast.show).toHaveBeenCalledWith(expect.objectContaining({ tone: 'warning' }));
    h.toast.show.mockClear();
    h.api['setOptionActive'].mockReturnValue(conflict('sites.OptionNotFound', 404));
    d.toggleOption(kind, {
      id: 'O1',
      code: 'single',
      nameEn: 'Single',
      nameAr: 'مفرد',
      sortOrder: 1,
      isActive: true,
    });
    await tick();
    await tick();
    expect(h.toast.show).toHaveBeenCalledWith(expect.objectContaining({ tone: 'warning' }));
  });

  it('options: add → D20 under the item, edit → D13 under /options/{id}', async () => {
    h = (TestBed.resetTestingModule(), setup({ tab: 'items' }));
    const fx = TestBed.createComponent(SiteDefinitionsComponent);
    fx.detectChanges();
    (
      fx.nativeElement.querySelector('[data-item="kind"] [data-open-item]') as HTMLButtonElement
    ).click();
    const d = ((h.drawerOpen.mock.calls[0] as unknown[])[1] as { data: SiteItemDrawerData }).data;
    const kind = fx.componentInstance['store'].items()!.find((i) => i.code === 'kind')!;
    d.addOption(kind);
    const add = formOf(h.modalOpen).data;
    await add.save({ ...add.initial, code: 'double', nameEn: 'Double', nameAr: 'مزدوج' });
    expect(h.api['addOption']).toHaveBeenCalledWith('I-kind', {
      code: 'double',
      nameEn: 'Double',
      nameAr: 'مزدوج',
      sortOrder: 1,
    });
    const opt = {
      id: 'O1',
      code: 'single',
      nameEn: 'Single',
      nameAr: 'مفرد',
      sortOrder: 1,
      isActive: true,
    };
    d.editOption(kind, opt);
    const edit = formOf(h.modalOpen, 1).data;
    await edit.save({ ...edit.initial, nameEn: 'One' });
    expect(h.api['updateOption']).toHaveBeenCalledWith('O1', {
      nameEn: 'One',
      nameAr: 'مفرد',
      sortOrder: 1,
    });
    d.toggleOption(kind, opt);
    await tick();
    expect(h.api['setOptionActive']).toHaveBeenCalledWith('O1', false);
  });
});

describe('SiteModuleDetailComponent (sites S-10)', () => {
  let h: ReturnType<typeof setup>;

  it('fields from D2 in order; Required/Visible send all three link fields (D9); move sends the full order (D8)', async () => {
    h = setup({}, { moduleId: 'M1' });
    const fx = TestBed.createComponent(SiteModuleDetailComponent);
    fx.detectChanges();
    const el = fx.nativeElement as HTMLElement;
    expect(
      [...el.querySelectorAll('[data-field]')].map((r) => r.getAttribute('data-field')),
    ).toEqual(['width_cm', 'kind', 'secret', 'finish']);
    const cmp = fx.componentInstance as unknown as {
      setFlag: (m: SiteModule, f: unknown, k: string, v: boolean) => void;
      move: (m: SiteModule, i: number, d: number) => void;
    };
    cmp.setFlag(mod({}), FIELDS[2], 'isVisible', true);
    await tick();
    expect(h.api['updateLink']).toHaveBeenCalledWith('M1', 'I-secret', {
      isRequired: false,
      isVisible: true,
      sortOrder: 3,
    });
    cmp.move(mod({}), 0, 1);
    await tick();
    expect(h.api['reorderItems']).toHaveBeenCalledWith('M1', [
      { itemId: 'I-kind', sortOrder: 1 },
      { itemId: 'I-width_cm', sortOrder: 2 },
      { itemId: 'I-secret', sortOrder: 3 },
      { itemId: 'I-finish', sortOrder: 4 },
    ]);
  });

  it('live preview renders only the visible fields, read-only', () => {
    h = setup({}, { moduleId: 'M1' });
    const fx = TestBed.createComponent(SiteModuleDetailComponent);
    fx.detectChanges();
    const el = fx.nativeElement as HTMLElement;
    const preview = el.querySelector('[data-preview]')!;
    expect(preview.querySelectorAll('[data-preview-field]')).toHaveLength(2);
    expect(preview.textContent).toContain('width_cm (cm)');
    expect(preview.textContent).not.toContain('secret');
    expect(el.querySelector('[data-act="delete"]')?.textContent).toContain('Delete');
  });

  it('Attach offers active unlinked items only → D7; AlreadyLinked inline', async () => {
    h = setup({}, { moduleId: 'M1' });
    const fx = TestBed.createComponent(SiteModuleDetailComponent);
    fx.detectChanges();
    (fx.nativeElement.querySelector('[data-attach] button') as HTMLButtonElement).click();
    const data = formOf(h.modalOpen).data;
    const choices = data.fields[0].options!.map((o) => o.value);
    expect(choices).toEqual(['I-free']);
    expect((await data.save({ itemId: 'I-free', isRequired: true, isVisible: true })).ok).toBe(
      true,
    );
    expect(h.api['attachItem']).toHaveBeenCalledWith('M1', {
      itemId: 'I-free',
      isRequired: true,
      isVisible: true,
      sortOrder: 5,
    });
    h.api['attachItem'].mockReturnValue(conflict('sites.AlreadyLinked'));
    expect((await data.save({ itemId: 'I-free', isRequired: false, isVisible: true })).code).toBe(
      'sites.AlreadyLinked',
    );
  });

  it('Detach confirms → D10; Delete refused (SystemModuleNotDeletable) shows inline', async () => {
    h = setup({}, { moduleId: 'M1' });
    const fx = TestBed.createComponent(SiteModuleDetailComponent);
    fx.detectChanges();
    const el = fx.nativeElement as HTMLElement;
    (el.querySelector('[data-field="kind"] [data-detach] button') as HTMLButtonElement).click();
    await tick();
    expect(h.api['detachItem']).toHaveBeenCalledWith('M1', 'I-kind');
    h.api['deleteModule'].mockReturnValue(conflict('sites.SystemModuleNotDeletable'));
    (el.querySelector('[data-act="delete"] button') as HTMLButtonElement).click();
    await tick();
    await tick();
    fx.detectChanges();
    expect(el.querySelector('[data-action-error]')).toBeTruthy();
  });

  it('a system module edit keeps its names; an inactive module cannot list fields (DEVIATION-S5)', async () => {
    h = setup({}, { moduleId: 'M1' });
    h.api['modules'].mockReturnValue(of([mod({ isSystem: true })]));
    let fx = TestBed.createComponent(SiteModuleDetailComponent);
    fx.detectChanges();
    (fx.nativeElement.querySelector('[data-act="edit"] button') as HTMLButtonElement).click();
    const data = formOf(h.modalOpen).data;
    await data.save({ ...data.initial, nameEn: 'Hacked', sortOrder: 4 });
    expect(h.api['updateModule']).toHaveBeenCalledWith(
      'M1',
      expect.objectContaining({ nameEn: 'Doors', sortOrder: 4 }),
    );
    TestBed.resetTestingModule();
    h = setup({}, { moduleId: 'M2' });
    fx = TestBed.createComponent(SiteModuleDetailComponent);
    fx.detectChanges();
    expect(fx.nativeElement.querySelector('[data-module-inactive]')).toBeTruthy();
    expect(fx.nativeElement.querySelector('[data-attach]')).toBeNull();
  });

  it('unknown module → not-found state', () => {
    h = setup({}, { moduleId: 'nope' });
    const fx = TestBed.createComponent(SiteModuleDetailComponent);
    fx.detectChanges();
    expect(fx.nativeElement.querySelector('[data-not-found]')).toBeTruthy();
  });
});

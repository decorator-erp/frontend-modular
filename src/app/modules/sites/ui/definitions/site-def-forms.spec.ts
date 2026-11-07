import { describe, expect, it, vi } from 'vitest';
import type { SiteItem } from '../../model/site-definition.model';
import {
  attachForm,
  editItemForm,
  limitsText,
  moduleForm,
  newItemForm,
  shapeForm,
} from './site-def-forms';

const t = (k: string, p?: Record<string, string | number>) => (p ? `${k}:${JSON.stringify(p)}` : k);
const item = (patch: Partial<SiteItem> = {}): SiteItem => ({
  id: 'I1',
  code: 'width_cm',
  nameEn: 'Width',
  nameAr: 'العرض',
  dataType: 1,
  unit: 'cm',
  minValue: 10,
  maxValue: 400,
  tolerance: 5,
  maxLength: null,
  regexPattern: null,
  isSystem: false,
  isActive: true,
  options: [],
  ...patch,
});
const ok = () => Promise.resolve({ ok: true });

describe('site definition forms (sites S-10, spec §5)', () => {
  it('module: code ≤64 required (create only), names 1..128, descriptions ≤512, sortOrder integer ≥0', () => {
    const f = moduleForm(t as never, null, 3, ok);
    expect(f.initial['sortOrder']).toBe(3);
    expect(Object.keys(f.validate({ ...f.initial }))).toEqual(['code', 'nameEn', 'nameAr']);
    const good = {
      code: 'X'.repeat(64),
      nameEn: 'a'.repeat(128),
      nameAr: 'ب',
      sortOrder: 0,
      descriptionEn: 'd'.repeat(512),
      descriptionAr: '',
    };
    expect(f.validate(good)).toEqual({});
    expect(
      Object.keys(
        f.validate({
          ...good,
          code: 'X'.repeat(65),
          nameEn: 'a'.repeat(129),
          sortOrder: -1,
          descriptionEn: 'd'.repeat(513),
        }),
      ),
    ).toEqual(['code', 'nameEn', 'sortOrder', 'descriptionEn']);
    expect(f.validate({ ...good, sortOrder: 1.5 })['sortOrder']).toBeTruthy();
  });

  it('a system module locks code and names and carries the rename note', () => {
    const f = moduleForm(
      t as never,
      {
        id: 'M',
        code: 'DOORS',
        nameEn: 'Doors',
        nameAr: 'أبواب',
        descriptionEn: null,
        descriptionAr: null,
        isSystem: true,
        sortOrder: 1,
        isActive: true,
      },
      1,
      ok,
    );
    expect(f.fields.filter((x) => x.disabled).map((x) => x.key)).toEqual([
      'code',
      'nameEn',
      'nameAr',
    ]);
    expect(f.note).toBe('sv.note.systemRename');
  });

  it('new item: limits are shown and sent only for their type (else LimitNotLegalForType)', async () => {
    const save = vi.fn(ok);
    const f = newItemForm(t as never, save);
    const show = (v: Record<string, unknown>) =>
      f.fields.filter((x) => !x.show || x.show(v as never)).map((x) => x.key);
    expect(show({ dataType: 1 })).toEqual(
      expect.arrayContaining(['minValue', 'maxValue', 'tolerance']),
    );
    expect(show({ dataType: 1 })).not.toContain('maxLength');
    expect(show({ dataType: 2 })).toEqual(expect.arrayContaining(['maxLength', 'regexPattern']));
    expect(show({ dataType: 4 })).not.toContain('minValue');
    await f.save({
      code: 'note',
      nameEn: 'N',
      nameAr: 'ن',
      dataType: 2,
      unit: '',
      tolerance: 3,
      minValue: 1,
      maxLength: 50,
      regexPattern: '^a',
    });
    expect(save).toHaveBeenCalledWith({
      code: 'note',
      nameEn: 'N',
      nameAr: 'ن',
      dataType: 2,
      unit: null,
      tolerance: 0,
      minValue: null,
      maxValue: null,
      maxLength: 50,
      regexPattern: '^a',
    });
  });

  it('item limits: |bound| < 1e14, min ≤ max, maxLength 1..1024, regex ≤256, unit ≤32, tolerance ≥0', () => {
    const f = newItemForm(t as never, ok);
    const base = { code: 'c', nameEn: 'a', nameAr: 'ب', dataType: 1, unit: '', tolerance: 0 };
    expect(f.validate({ ...base, minValue: 5, maxValue: 5 })).toEqual({});
    expect(f.validate({ ...base, minValue: 6, maxValue: 5 })['maxValue']).toBe('sv.err.minMax');
    expect(f.validate({ ...base, minValue: 1e14 })['minValue']).toBe('sv.err.limitRange');
    expect(f.validate({ ...base, tolerance: -1 })['tolerance']).toBe('sv.err.tolerance');
    expect(f.validate({ ...base, unit: 'u'.repeat(33) })['unit']).toBe('sv.err.unitLong');
    const text = { ...base, dataType: 2 };
    expect(f.validate({ ...text, maxLength: 1024 })).toEqual({});
    expect(f.validate({ ...text, maxLength: 0 })['maxLength']).toBe('sv.err.maxLength');
    expect(f.validate({ ...text, maxLength: 1025 })['maxLength']).toBe('sv.err.maxLength');
    expect(f.validate({ ...text, regexPattern: 'r'.repeat(257) })['regexPattern']).toBe(
      'sv.err.regexLong',
    );
  });

  it('edit item sends D16 only (names + type limits); a system item locks names', async () => {
    const save = vi.fn(ok);
    const f = editItemForm(t as never, item({ isSystem: true }), save);
    expect(f.fields.filter((x) => x.disabled).map((x) => x.key)).toEqual(['nameEn', 'nameAr']);
    await f.save({ ...f.initial });
    expect(save).toHaveBeenCalledWith({
      nameEn: 'Width',
      nameAr: 'العرض',
      minValue: 10,
      maxValue: 400,
      maxLength: null,
      regexPattern: null,
    });
  });

  it('change shape warns ItemLocked once values exist', () => {
    expect(shapeForm(t as never, item(), true, ok).note).toBe('sv.note.shapeLocked');
    expect(shapeForm(t as never, item(), false, ok).note).toBe('sv.note.shapeFree');
  });

  it('A5: change shape shows tolerance for Number only, sends 0 otherwise, and refuses a type the stored limits do not fit', async () => {
    const save = vi.fn(ok);
    const f = shapeForm(t as never, item(), false, save);
    const tol = f.fields.find((x) => x.key === 'tolerance')!;
    expect(tol.show?.({ ...f.initial })).toBe(true);
    expect(tol.show?.({ ...f.initial, dataType: 2 })).toBe(false);
    // stored min/max (10..400) are kept by D17 (SiteItem.ChangeCapturedShape) → LimitNotLegalForType
    expect(f.validate({ ...f.initial, dataType: 2 })['dataType']).toBe('sv.err.shapeLimits');
    const bare = shapeForm(t as never, item({ minValue: null, maxValue: null }), false, save);
    expect(bare.validate({ ...bare.initial, dataType: 2 })).toEqual({});
    await bare.save({ ...bare.initial, dataType: 2 });
    expect(save).toHaveBeenCalledWith({ code: 'width_cm', dataType: 2, unit: 'cm', tolerance: 0 });
    // Text limits (maxLength / regex) do not fit any other type either
    const text = shapeForm(
      t as never,
      item({ dataType: 2, minValue: null, maxValue: null, tolerance: 0, maxLength: 20 }),
      false,
      save,
    );
    expect(text.validate({ ...text.initial, dataType: 3 })['dataType']).toBe('sv.err.shapeLimits');
  });

  it('attach needs an item', () => {
    const f = attachForm(t as never, 'DOORS', [{ value: 'I1', label: 'x' }], ok);
    expect(f.validate(f.initial)).toEqual({ itemId: 'sv.err.pickItem' });
    expect(f.initial).toEqual({ itemId: null, isRequired: false, isVisible: true });
  });

  it('limits text per type', () => {
    expect(limitsText(item(), t as never)).toBe('10 – 400 · ± 5');
    expect(limitsText(item({ dataType: 2, maxLength: 2000, regexPattern: '^a' }), t as never)).toBe(
      '≤ 1024 · /^a/',
    );
    expect(
      limitsText(item({ dataType: 3, minValue: null, maxValue: null, tolerance: 0 }), t as never),
    ).toBe('—');
  });
});

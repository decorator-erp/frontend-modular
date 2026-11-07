import { describe, expect, it } from 'vitest';
import { EMPTY_UNIT_DATA } from './site.model';
import type { SiteSchemaField } from './site-definition.model';
import {
  validateCell,
  validateDecisionNote,
  validateLabel,
  validateUnitData,
} from './site-validation';

const unit = (patch: Partial<typeof EMPTY_UNIT_DATA>) =>
  validateUnitData({ ...EMPTY_UNIT_DATA, ...patch });

describe('site-validation (spec §5 boundaries)', () => {
  it.each([
    [0.01, true],
    [999999.99, true],
    [12.5, true],
    [0, false],
    [-1, false],
    [1e6, false],
    [1.005, false],
  ])('area %s ok=%s', (areaSqm, ok) => {
    expect(!unit({ areaSqm }).areaSqm).toBe(ok);
  });

  it.each([
    [-5, true],
    [200, true],
    [0, true],
    [-6, false],
    [201, false],
    [1.5, false],
  ])('floor %s ok=%s', (floorNo, ok) => {
    expect(!unit({ floorNo }).floorNo).toBe(ok);
  });

  it.each([
    [1, true],
    [100, true],
    [0, false],
    [101, false],
  ])('units per floor %s ok=%s', (unitsPerFloor, ok) => {
    expect(!unit({ unitsPerFloor }).unitsPerFloor).toBe(ok);
  });

  it('address ≤500, notes and utility meters ≤4000', () => {
    expect(unit({ address: 'a'.repeat(500) }).address).toBeUndefined();
    expect(unit({ address: 'a'.repeat(501) }).address?.key).toBe('sv.err.addressLong');
    expect(unit({ notes: 'a'.repeat(4000) }).notes).toBeUndefined();
    expect(unit({ notes: 'a'.repeat(4001) }).notes?.key).toBe('sv.err.longText');
    expect(unit({ utilityMetersNote: 'a'.repeat(4001) }).utilityMetersNote).toBeTruthy();
  });

  it('decision note ≤1000', () => {
    expect(validateDecisionNote('a'.repeat(1000))).toBeNull();
    expect(validateDecisionNote('a'.repeat(1001))?.key).toBe('sv.err.noteLong');
    expect(validateDecisionNote(null)).toBeNull();
  });

  it('label: required, ≤200, not __', () => {
    expect(validateLabel('a'.repeat(200))).toBeNull();
    expect(validateLabel('a'.repeat(201))?.key).toBe('sv.err.labelLong200');
    expect(validateLabel('__x')?.key).toBe('sv.err.labelReserved');
    expect(validateLabel('  ')?.key).toBe('sv.err.labelRequired');
  });

  const field = (patch: Partial<SiteSchemaField>): SiteSchemaField => ({
    linkId: 'L',
    itemId: 'I',
    code: 'c',
    nameEn: 'C',
    nameAr: 'ج',
    dataType: 1,
    unit: null,
    minValue: null,
    maxValue: null,
    tolerance: 0,
    maxLength: null,
    regexPattern: null,
    isRequired: false,
    isVisible: true,
    sortOrder: 1,
    options: [],
    ...patch,
  });

  it('number: min/max, ±1e14, ≤4 decimals', () => {
    const f = field({ minValue: 10, maxValue: 20 });
    expect(validateCell(f, 10)).toBeNull();
    expect(validateCell(f, 20)).toBeNull();
    expect(validateCell(f, 9.9)?.key).toBe('sv.err.min');
    expect(validateCell(f, 20.1)?.key).toBe('sv.err.max');
    expect(validateCell(field({}), 1.23456)?.key).toBe('sv.err.numberRange');
    expect(validateCell(field({}), 1e14)?.key).toBe('sv.err.numberRange');
  });

  it('text: min(maxLength, 1024) and pattern', () => {
    expect(validateCell(field({ dataType: 2, maxLength: 3 }), 'abcd')?.key).toBe('sv.err.textLong');
    expect(validateCell(field({ dataType: 2 }), 'a'.repeat(1024))).toBeNull();
    expect(validateCell(field({ dataType: 2, maxLength: 5000 }), 'a'.repeat(1025))?.params).toEqual(
      { n: 1024 },
    );
    expect(validateCell(field({ dataType: 2, regexPattern: '^D-\\d+$' }), 'X')?.key).toBe(
      'sv.err.pattern',
    );
    expect(validateCell(field({ dataType: 2, regexPattern: '(' }), 'X')).toBeNull();
  });

  it('required, select active options, date shape', () => {
    expect(validateCell(field({ isRequired: true }), null)?.key).toBe('sv.err.required');
    expect(validateCell(field({ dataType: 2, isRequired: true }), '   ')?.key).toBe(
      'sv.err.required',
    );
    const opts = [
      { id: 'O1', code: 'a', nameEn: 'A', nameAr: 'أ', sortOrder: 1, isActive: true },
      { id: 'O2', code: 'b', nameEn: 'B', nameAr: 'ب', sortOrder: 2, isActive: false },
    ];
    expect(validateCell(field({ dataType: 4, options: opts }), 'O1')).toBeNull();
    expect(validateCell(field({ dataType: 4, options: opts }), 'O2')?.key).toBe('sv.err.option');
    expect(validateCell(field({ dataType: 5 }), '2026-11-01')).toBeNull();
    expect(validateCell(field({ dataType: 3 }), true)).toBeNull();
  });
});

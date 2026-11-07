import type { CatalogKey } from '@platform/i18n/catalog/en';
import { SiteItemDataType } from './site-enums';
import type { SiteSchemaField } from './site-definition.model';
import type { SiteUnitData } from './site.model';

/**
 * sites: the client mirror of the backend limits (spec §5). A failing client check blocks the call.
 * Each check returns a catalog key (+ params) or null.
 */
export interface SiteFieldError {
  key: CatalogKey;
  params?: Record<string, string | number>;
}

export const ADDRESS_MAX = 500; // SiteInputValidators.cs:31
export const LONG_NOTE_MAX = 4000; // SiteInputValidators.cs:32-33 (notes, utilityMetersNote)
export const DECISION_NOTE_MAX = 1000; // SiteCommandHandlers.cs:220 (DEVIATION-S2)
export const LABEL_MAX = 200; // SiteRecordCommandHandlers.cs:245-246 (DEVIATION-S3)
export const RECORD_NOTE_MAX = 500; // UI cap only (prototype sites.js:516; no server limit)
export const TEXT_VALUE_MAX = 1024; // SiteInputValidators.cs:53
export const NUMBER_ABS_MAX = 1e14; // SiteInputValidators.cs:50-52
export const BULK_MAX_ROWS = 500; // SiteRecordCommandHandlers.cs:222

const decimals = (n: number): number => {
  const s = String(n);
  if (s.includes('e-')) return Number(s.split('e-')[1]);
  const i = s.indexOf('.');
  return i < 0 ? 0 : s.length - i - 1;
};

export type UnitDataErrors = Partial<Record<keyof SiteUnitData, SiteFieldError>>;

/** `SiteUnitDataRequest` checks (`SiteInputValidators.cs:31-40`; `Site.cs:248-261`). */
export function validateUnitData(d: SiteUnitData): UnitDataErrors {
  const e: UnitDataErrors = {};
  if (d.address && d.address.length > ADDRESS_MAX) e.address = { key: 'sv.err.addressLong' };
  if (d.notes && d.notes.length > LONG_NOTE_MAX)
    e.notes = { key: 'sv.err.longText', params: { n: LONG_NOTE_MAX } };
  if (d.utilityMetersNote && d.utilityMetersNote.length > LONG_NOTE_MAX)
    e.utilityMetersNote = { key: 'sv.err.longText', params: { n: LONG_NOTE_MAX } };
  if (d.areaSqm != null) {
    const a = d.areaSqm;
    if (!Number.isFinite(a) || !(a > 0) || a >= 1_000_000 || decimals(a) > 2)
      e.areaSqm = { key: 'sv.err.area' };
  }
  if (d.floorNo != null && (!Number.isInteger(d.floorNo) || d.floorNo < -5 || d.floorNo > 200))
    e.floorNo = { key: 'sv.err.floor' };
  if (
    d.unitsPerFloor != null &&
    (!Number.isInteger(d.unitsPerFloor) || d.unitsPerFloor < 1 || d.unitsPerFloor > 100)
  )
    e.unitsPerFloor = { key: 'sv.err.unitsPerFloor' };
  return e;
}

/** Decision note ≤1000 (DEVIATION-S2). */
export function validateDecisionNote(note: string | null | undefined): SiteFieldError | null {
  return note && note.length > DECISION_NOTE_MAX ? { key: 'sv.err.noteLong' } : null;
}

/** Record label: non-empty, ≤200, not starting `__` (`SiteRecordLabelRules`). */
export function validateLabel(label: string | null | undefined): SiteFieldError | null {
  const l = (label ?? '').trim();
  if (!l) return { key: 'sv.err.labelRequired' };
  if (l.length > LABEL_MAX) return { key: 'sv.err.labelLong200' };
  if (l.startsWith('__')) return { key: 'sv.err.labelReserved' };
  return null;
}

/** A grid cell's draft value: number, string, boolean, date string, option id — or null (empty). */
export type CellValue = number | string | boolean | null;

export function isEmptyCell(field: SiteSchemaField, v: CellValue): boolean {
  if (v == null) return true;
  if (field.dataType === SiteItemDataType.Text) return String(v).trim() === '';
  return v === '';
}

/** The effective Text cap: the item's `maxLength`, never above 1024. */
export function textCap(field: Pick<SiteSchemaField, 'maxLength'>): number {
  return Math.min(field.maxLength ?? TEXT_VALUE_MAX, TEXT_VALUE_MAX);
}

/**
 * One cell against its field (`SiteModuleValidator.cs:111-235`, `SiteInputValidators.cs:50-53`).
 * `Required` is checked here too, so a hidden field is never passed in.
 */
export function validateCell(field: SiteSchemaField, v: CellValue): SiteFieldError | null {
  if (isEmptyCell(field, v)) return field.isRequired ? { key: 'sv.err.required' } : null;
  switch (field.dataType) {
    case SiteItemDataType.Number: {
      const n = typeof v === 'number' ? v : Number(v);
      if (!Number.isFinite(n)) return { key: 'sv.err.number' };
      if (Math.abs(n) >= NUMBER_ABS_MAX || decimals(n) > 4) return { key: 'sv.err.numberRange' };
      if (field.minValue != null && n < field.minValue)
        return { key: 'sv.err.min', params: { v: field.minValue } };
      if (field.maxValue != null && n > field.maxValue)
        return { key: 'sv.err.max', params: { v: field.maxValue } };
      return null;
    }
    case SiteItemDataType.Text: {
      const t = String(v).trim();
      const cap = textCap(field);
      if (t.length > cap) return { key: 'sv.err.textLong', params: { n: cap } };
      if (field.regexPattern) {
        try {
          if (!new RegExp(field.regexPattern).test(t)) return { key: 'sv.err.pattern' };
        } catch {
          // A malformed pattern passes, as on the server (SiteModuleValidator.SafeIsMatch).
        }
      }
      return null;
    }
    case SiteItemDataType.Bool:
      return typeof v === 'boolean' ? null : { key: 'sv.err.typeMismatch' };
    case SiteItemDataType.Select:
      return field.options.some((o) => o.id === v && o.isActive) ? null : { key: 'sv.err.option' };
    case SiteItemDataType.Date:
      return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)
        ? null
        : { key: 'sv.err.typeMismatch' };
    default:
      return null;
  }
}

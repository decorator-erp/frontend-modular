import type { CatalogKey } from '@platform/i18n/catalog/en';
import { SiteItemDataType } from './site-enums';
import type { SiteSchemaField } from './site-definition.model';
import type {
  BulkSiteRecordRequest,
  SitePivotCell,
  SitePivotRow,
  SiteValueRequest,
} from './site.model';
import {
  BULK_MAX_ROWS,
  type CellValue,
  type SiteFieldError,
  isEmptyCell,
  textCap,
  validateCell,
  validateLabel,
} from './site-validation';

/**
 * sites S-5: the capture grid's pure logic — draft rows from the pivot, the client pre-check, the one
 * bulk body, and the mapping of a refused save back onto rows (the server names no row, spec §7 S-5).
 */

export interface DraftRow {
  /** Render/track key, local only; never sent. */
  key: string;
  recordId: string | null;
  label: string;
  spaceId: string | null;
  /** Stored name of the row's space (from the pivot), shown when the space list is unavailable. */
  spaceName: string | null;
  catalogItemId: string | null;
  note: string;
  /** Visible fields only, by item id. */
  values: Record<string, CellValue>;
  /**
   * DEVIATION-17: the stored values of the module's HIDDEN fields, resent unchanged so the save does
   * not clear them. Never shown, never edited; empty for new and duplicated rows.
   */
  hidden: SiteValueRequest[];
}

/** `${row.key}:${'label' | 'space' | 'catalog' | 'note' | itemId}` → message. */
export type CellErrors = Record<string, string>;

export type Translate = (key: CatalogKey, params?: Record<string, string | number>) => string;

let seq = 0;
export const newRowKey = (): string => `row-${++seq}`;

/** The cell's value as the editor holds it. */
export function cellValue(
  field: SiteSchemaField,
  cell: SitePivotCell | null | undefined,
): CellValue {
  if (!cell) return null;
  switch (field.dataType) {
    case SiteItemDataType.Number:
      return cell.valueNumber;
    case SiteItemDataType.Text:
      return cell.valueText;
    case SiteItemDataType.Bool:
      return cell.valueBool;
    case SiteItemDataType.Select:
      return cell.optionId;
    case SiteItemDataType.Date:
      return cell.valueDate;
    default:
      return null;
  }
}

/** One `SiteValueRequest` with exactly one member set, or null for an empty cell. */
export function valueRequest(field: SiteSchemaField, v: CellValue): SiteValueRequest | null {
  if (isEmptyCell(field, v)) return null;
  switch (field.dataType) {
    case SiteItemDataType.Number:
      return { itemId: field.itemId, valueNumber: typeof v === 'number' ? v : Number(v) };
    case SiteItemDataType.Text:
      return { itemId: field.itemId, valueText: String(v).trim() };
    case SiteItemDataType.Bool:
      return { itemId: field.itemId, valueBool: v === true };
    case SiteItemDataType.Select:
      return { itemId: field.itemId, optionId: String(v) };
    case SiteItemDataType.Date:
      return { itemId: field.itemId, valueDate: String(v) };
    default:
      return null;
  }
}

/**
 * The hidden fields' stored values to resend (DEVIATION-17). A stored option that is no longer active
 * cannot be resent (the validator refuses it, `SiteModuleValidator.cs:213-221`), so it is left out and
 * counted as unreadable — that save clears it.
 */
export function hiddenValues(
  hidden: SiteSchemaField[],
  row: SitePivotRow,
): { values: SiteValueRequest[]; unreadable: number } {
  const values: SiteValueRequest[] = [];
  let unreadable = 0;
  for (const f of hidden) {
    const v = cellValue(f, row.cells[f.code]);
    if (v == null) continue;
    if (
      f.dataType === SiteItemDataType.Select &&
      !f.options.some((o) => o.id === v && o.isActive)
    ) {
      unreadable++;
      continue;
    }
    const req = valueRequest(f, v);
    if (req) values.push(req);
  }
  return { values, unreadable };
}

export function draftFromPivot(
  rows: SitePivotRow[],
  visible: SiteSchemaField[],
  hidden: SiteSchemaField[],
  catalogByRecord: ReadonlyMap<string, string | null>,
): { rows: DraftRow[]; unreadable: number } {
  let unreadable = 0;
  const out = rows.map((r) => {
    const h = hiddenValues(hidden, r);
    unreadable += h.unreadable;
    const values: Record<string, CellValue> = {};
    for (const f of visible) values[f.itemId] = cellValue(f, r.cells[f.code]);
    return {
      key: newRowKey(),
      recordId: r.recordId,
      label: r.label,
      spaceId: r.spaceId,
      spaceName: r.spaceName,
      catalogItemId: catalogByRecord.get(r.recordId) ?? null,
      note: r.note ?? '',
      values,
      hidden: h.values,
    };
  });
  return { rows: out, unreadable };
}

/** The next free `<prefix>-NN` label (case-insensitive), prefix from the module code. */
export function nextLabel(moduleCode: string, rows: Pick<DraftRow, 'label'>[]): string {
  const prefix = (moduleCode.replace(/[^A-Za-z]/g, '').slice(0, 2) || 'R').toUpperCase();
  const used = new Set(rows.map((r) => r.label.trim().toLowerCase()));
  for (let i = 1; ; i++) {
    const l = `${prefix}-${String(i).padStart(2, '0')}`;
    if (!used.has(l.toLowerCase())) return l;
  }
}

export function blankRow(
  moduleCode: string,
  rows: DraftRow[],
  visible: SiteSchemaField[],
): DraftRow {
  const values: Record<string, CellValue> = {};
  for (const f of visible) values[f.itemId] = null;
  return {
    key: newRowKey(),
    recordId: null,
    label: nextLabel(moduleCode, rows),
    spaceId: null,
    spaceName: null,
    catalogItemId: null,
    note: '',
    values,
    hidden: [],
  };
}

/** A copy as a new record: new label, no record id, no hidden values (nothing stored to keep). */
export function duplicateRow(src: DraftRow, moduleCode: string, rows: DraftRow[]): DraftRow {
  return {
    ...src,
    key: newRowKey(),
    recordId: null,
    label: nextLabel(moduleCode, rows),
    values: { ...src.values },
    hidden: [],
  };
}

const msg = (t: Translate, e: SiteFieldError) => t(e.key, e.params);

/**
 * The client pre-check (spec §5): label rules, per-cell rules of the visible fields, the note cap, and
 * duplicate FINAL labels (trimmed, case-insensitive) — so a swap of two labels in one save passes.
 */
export function precheck(
  rows: DraftRow[],
  visible: SiteSchemaField[],
  t: Translate,
  noteMax: number,
): CellErrors {
  const errors: CellErrors = {};
  const byLabel = new Map<string, string[]>();
  for (const row of rows) {
    const le = validateLabel(row.label);
    if (le) errors[`${row.key}:label`] = msg(t, le);
    else {
      const k = row.label.trim().toLowerCase();
      byLabel.set(k, [...(byLabel.get(k) ?? []), row.key]);
    }
    for (const f of visible) {
      const e = validateCell(f, row.values[f.itemId] ?? null);
      if (e) errors[`${row.key}:${f.itemId}`] = msg(t, e);
    }
    if (row.note.length > noteMax) errors[`${row.key}:note`] = t('sv.err.textLong', { n: noteMax });
  }
  for (const keys of byLabel.values()) {
    if (keys.length > 1) for (const k of keys) errors[`${k}:label`] = t('sv.err.labelDuplicate');
  }
  return errors;
}

export function tooManyRows(rows: DraftRow[]): boolean {
  return rows.length > BULK_MAX_ROWS;
}

/** The ONE bulk body: every row, `sortOrder` = index + 1, visible values that are set + hidden resends. */
export function bulkBody(
  rows: DraftRow[],
  moduleId: string,
  visible: SiteSchemaField[],
): BulkSiteRecordRequest[] {
  return rows.map((row, i) => ({
    recordId: row.recordId,
    moduleId,
    label: row.label.trim(),
    spaceId: row.spaceId,
    catalogItemId: row.catalogItemId,
    sortOrder: i + 1,
    note: row.note.trim() || null,
    values: [
      ...visible
        .map((f) => valueRequest(f, row.values[f.itemId] ?? null))
        .filter((v): v is SiteValueRequest => !!v),
      ...row.hidden,
    ],
  }));
}

// ── mapping a refused save onto the grid ──────────────────────────────────────

const RULE_KEY: Record<string, CatalogKey> = {
  Required: 'sv.err.required',
  Min: 'sv.err.min',
  Max: 'sv.err.max',
  MaxLength: 'sv.err.textLong',
  Pattern: 'sv.err.pattern',
  Option: 'sv.err.option',
  TypeMismatch: 'sv.err.typeMismatch',
  OneValue: 'sv.err.typeMismatch',
  Duplicate: 'sv.err.typeMismatch',
};

function ruleMessage(rule: string, f: SiteSchemaField, t: Translate): string {
  const key = RULE_KEY[rule] ?? 'sv.err.typeMismatch';
  if (rule === 'Min') return t(key, { v: f.minValue ?? '' });
  if (rule === 'Max') return t(key, { v: f.maxValue ?? '' });
  if (rule === 'MaxLength') return t(key, { n: textCap(f) });
  return t(key);
}

/** Does the row fail `rule` for this field locally? */
function failsLocally(rule: string, f: SiteSchemaField, v: CellValue): boolean {
  const empty = isEmptyCell(f, v);
  switch (rule) {
    case 'Required':
      return empty;
    case 'Min':
      return !empty && f.minValue != null && Number(v) < f.minValue;
    case 'Max':
      return !empty && f.maxValue != null && Number(v) > f.maxValue;
    case 'MaxLength':
      return !empty && f.maxLength != null && String(v).trim().length > f.maxLength;
    case 'Pattern':
      return !empty && validateCell(f, v)?.key === 'sv.err.pattern';
    case 'Option':
      return !empty && !f.options.some((o) => o.id === v && o.isActive);
    case 'TypeMismatch':
    case 'OneValue':
      return !empty && wrongType(f, v);
    default:
      return false;
  }
}

function wrongType(f: SiteSchemaField, v: CellValue): boolean {
  switch (f.dataType) {
    case SiteItemDataType.Number:
      return !Number.isFinite(typeof v === 'number' ? v : Number(v));
    case SiteItemDataType.Bool:
      return typeof v !== 'boolean';
    case SiteItemDataType.Date:
      return !(typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v));
    case SiteItemDataType.Select:
    case SiteItemDataType.Text:
      return typeof v !== 'string';
    default:
      return false;
  }
}

export interface MapContext {
  rows: DraftRow[];
  visible: SiteSchemaField[];
  hidden: SiteSchemaField[];
  /** The bulk body that was sent (for `Request.Records[i].Values[j]`). */
  sent: BulkSiteRecordRequest[];
  /** Labels of stored records that are not rows of this save (after the reload). */
  otherLabels: string[];
  spaceIds: ReadonlySet<string> | null;
  catalogItemIds: ReadonlySet<string> | null;
  t: Translate;
  /** A field's name in the UI language. */
  fieldName: (f: SiteSchemaField) => string;
}

export interface MappedErrors {
  cells: CellErrors;
  banner: string | null;
}

/**
 * Put a refused save's problem body back on the grid (spec §7 S-5). `errors` is the raw map,
 * `code` its first domain code, `fallback` the catalog message for the banner.
 */
export function mapSaveErrors(
  errors: Record<string, string[]>,
  code: string | null,
  fallback: string,
  ctx: MapContext,
): MappedErrors {
  const cells: CellErrors = {};
  const banners: string[] = [];
  const { rows, visible, t } = ctx;
  const fieldByCode = new Map([...visible, ...ctx.hidden].map((f) => [f.code, f]));

  for (const [key, messages] of Object.entries(errors)) {
    // FluentValidation property paths: Request.Records[i].Label / .Note / .SortOrder / .Values[j].X
    const path = /^Request\.Records\[(\d+)\]\.(\w+)(?:\[(\d+)\])?/i.exec(key);
    if (path) {
      const row = rows[Number(path[1])];
      const member = path[2].toLowerCase();
      if (!row) {
        banners.push(messages[0] ?? fallback);
        continue;
      }
      if (member === 'values' && path[3] != null) {
        const itemId = ctx.sent[Number(path[1])]?.values[Number(path[3])]?.itemId;
        if (itemId && visible.some((f) => f.itemId === itemId)) {
          cells[`${row.key}:${itemId}`] = messages[0] ?? t('sv.err.typeMismatch');
        } else banners.push(messages[0] ?? fallback);
      } else if (member === 'note') cells[`${row.key}:note`] = messages[0] ?? fallback;
      else cells[`${row.key}:label`] = messages[0] ?? fallback;
      continue;
    }
    // Module validator: sites.validation.<itemCode>.<rule>
    const rule = /^sites\.validation\.(.+)\.(\w+)$/.exec(key);
    if (rule || key === 'sites.validation.UnknownItem') {
      if (!rule || key === 'sites.validation.UnknownItem') {
        banners.push(t('sv.err.unknownItem'));
        continue;
      }
      const f = fieldByCode.get(rule[1]);
      const visibleField = f && visible.includes(f) ? f : null;
      const hit = visibleField
        ? rows.find((r) =>
            failsLocally(rule[2], visibleField, r.values[visibleField.itemId] ?? null),
          )
        : undefined;
      if (hit && visibleField)
        cells[`${hit.key}:${visibleField.itemId}`] = ruleMessage(rule[2], visibleField, t);
      else banners.push(f ? `${ctx.fieldName(f)}: ${ruleMessage(rule[2], f, t)}` : fallback);
    }
  }

  switch (code) {
    case 'sites.LabelTaken': {
      const taken = new Set(ctx.otherLabels.map((l) => l.trim().toLowerCase()));
      const hits = rows.filter((r) => taken.has(r.label.trim().toLowerCase()));
      for (const r of hits) cells[`${r.key}:label`] = fallback;
      if (!hits.length) banners.push(fallback);
      break;
    }
    case 'sites.ValueTypeMismatch': {
      const hit = firstCell(rows, visible, (f, v) => !isEmptyCell(f, v) && wrongType(f, v));
      if (hit) cells[hit] = fallback;
      else banners.push(fallback);
      break;
    }
    case 'sites.OptionNotOfItem': {
      const hit = firstCell(
        rows,
        visible,
        (f, v) =>
          f.dataType === SiteItemDataType.Select &&
          !isEmptyCell(f, v) &&
          !f.options.some((o) => o.id === v),
      );
      if (hit) cells[hit] = fallback;
      else banners.push(fallback);
      break;
    }
    case 'sites.CatalogItemNotFound': {
      const known = ctx.catalogItemIds;
      const row =
        rows.find((r) => r.catalogItemId && known && !known.has(r.catalogItemId)) ??
        rows.find((r) => r.catalogItemId);
      if (row) cells[`${row.key}:catalog`] = fallback;
      else banners.push(fallback);
      break;
    }
    case 'sites.SpaceNotFound':
    case 'sites.SpaceNotInProject': {
      const known = ctx.spaceIds;
      const row =
        rows.find((r) => r.spaceId && known && !known.has(r.spaceId)) ??
        rows.find((r) => r.spaceId);
      if (row) cells[`${row.key}:space`] = fallback;
      else banners.push(fallback);
      break;
    }
    default:
      if (code && !code.startsWith('sites.validation.')) banners.push(fallback);
  }

  if (!Object.keys(cells).length && !banners.length) banners.push(fallback);
  return { cells, banner: banners.length ? [...new Set(banners)].join(' · ') : null };
}

function firstCell(
  rows: DraftRow[],
  visible: SiteSchemaField[],
  test: (f: SiteSchemaField, v: CellValue) => boolean,
): string | null {
  for (const r of rows)
    for (const f of visible) if (test(f, r.values[f.itemId] ?? null)) return `${r.key}:${f.itemId}`;
  return null;
}

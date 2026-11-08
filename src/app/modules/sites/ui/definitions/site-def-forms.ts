import type { SelectOption } from '@ds';
import type { CatalogKey } from '@platform/i18n/catalog/en';
import { SITE_ITEM_DATA_TYPE_LABEL, SiteItemDataType } from '../../model/site-enums';
import type {
  ChangeSiteItemShapeRequest,
  CreateSiteItemRequest,
  CreateSiteModuleRequest,
  SiteItem,
  SiteItemOption,
  SiteModule,
  UpdateSiteItemRequest,
} from '../../model/site-definition.model';
import type { WriteOutcome } from '../../model/site-errors';
import { NUMBER_ABS_MAX, TEXT_VALUE_MAX } from '../../model/site-validation';
import type { DefField, DefFormData, DefValues } from './site-def-form-dialog.component';

/** A dialog save: the store write's outcome. */
type Save<R> = (req: R) => Promise<WriteOutcome<unknown>>;

type T = (key: CatalogKey, params?: Record<string, string | number>) => string;

/** §5 definition limits (`SiteModuleCommandHandlers.cs:20-25`, `SiteItemCommandHandlers.cs:17-30`). */
export const DEF_CODE_MAX = 64;
export const DEF_NAME_MAX = 128;
export const DEF_DESC_MAX = 512;
export const DEF_UNIT_MAX = 32;
export const DEF_REGEX_MAX = 256;

const str = (v: unknown): string => (v == null ? '' : String(v)).trim();
/** '' / null → null; anything else → a number (NaN when not one). */
export const numOrNull = (v: unknown): number | null => (str(v) === '' ? null : Number(str(v)));

function checkCode(v: DefValues, t: T, out: Record<string, string>): void {
  const code = str(v['code']);
  if (!code || code.length > DEF_CODE_MAX) out['code'] = t('sv.err.code');
}

function checkNames(v: DefValues, t: T, out: Record<string, string>): void {
  for (const k of ['nameEn', 'nameAr']) {
    const s = str(v[k]);
    if (!s) out[k] = t('sv.err.names');
    else if (s.length > DEF_NAME_MAX) out[k] = t('sv.err.nameLong');
  }
}

function checkSort(v: DefValues, t: T, out: Record<string, string>): void {
  const n = numOrNull(v['sortOrder']);
  if (n === null || !Number.isInteger(n) || n < 0) out['sortOrder'] = t('sv.err.sortOrder');
}

export function dataTypeOptions(t: T): SelectOption[] {
  return (Object.values(SiteItemDataType) as number[]).map((d) => ({
    value: d,
    label: t(SITE_ITEM_DATA_TYPE_LABEL[d]),
  }));
}

/** The limits text of an item row (prototype `limitsText`, `sites.js:788-794`). */
export function limitsText(i: SiteItem, t: T): string {
  const parts: string[] = [];
  if (i.dataType === SiteItemDataType.Number) {
    if (i.minValue != null || i.maxValue != null)
      parts.push(`${i.minValue ?? '…'} – ${i.maxValue ?? '…'}`);
    if (i.tolerance) parts.push(`± ${i.tolerance}`);
  }
  if (i.dataType === SiteItemDataType.Text) {
    parts.push(`≤ ${Math.min(i.maxLength || TEXT_VALUE_MAX, TEXT_VALUE_MAX)}`);
    if (i.regexPattern) parts.push(`/${i.regexPattern}/`);
  }
  if (i.dataType === SiteItemDataType.Select) {
    parts.push(t('sv.optionsN', { n: i.options.filter((o) => o.isActive).length }));
  }
  return parts.join(' · ') || '—';
}

// ── modules (D3 / D4) ─────────────────────────────────────────────────────────

export function moduleForm(
  t: T,
  module: SiteModule | null,
  nextSort: number,
  save: Save<CreateSiteModuleRequest>,
): DefFormData {
  const locked = !!module?.isSystem;
  return {
    title: t(module ? 'sv.editModule' : 'sv.newModule'),
    subtitle: module?.code,
    submitLabel: t(module ? 'sv.saveChanges' : 'sv.create'),
    note: locked ? t('sv.note.systemRename') : undefined,
    fields: [
      {
        key: 'code',
        label: t('sv.code'),
        kind: 'text',
        required: true,
        disabled: !!module,
        dir: 'ltr',
        hint: t('sv.codeHintModuleApi'),
      },
      { key: 'sortOrder', label: t('sv.sortOrder'), kind: 'number', required: true },
      {
        key: 'nameEn',
        label: t('sv.nameEn'),
        kind: 'text',
        required: true,
        disabled: locked,
        dir: 'ltr',
      },
      {
        key: 'nameAr',
        label: t('sv.nameAr'),
        kind: 'text',
        required: true,
        disabled: locked,
        dir: 'rtl',
      },
      { key: 'descriptionEn', label: t('sv.descEn'), kind: 'textarea', wide: true, dir: 'ltr' },
      { key: 'descriptionAr', label: t('sv.descAr'), kind: 'textarea', wide: true, dir: 'rtl' },
    ],
    initial: {
      code: module?.code ?? '',
      sortOrder: module?.sortOrder ?? nextSort,
      nameEn: module?.nameEn ?? '',
      nameAr: module?.nameAr ?? '',
      descriptionEn: module?.descriptionEn ?? '',
      descriptionAr: module?.descriptionAr ?? '',
    },
    validate: (v) => {
      const out: Record<string, string> = {};
      if (!module) checkCode(v, t, out);
      checkNames(v, t, out);
      checkSort(v, t, out);
      for (const k of ['descriptionEn', 'descriptionAr']) {
        if (str(v[k]).length > DEF_DESC_MAX) out[k] = t('sv.err.descLong');
      }
      return out;
    },
    save: (v) =>
      save({
        code: str(v['code']),
        nameEn: str(v['nameEn']),
        nameAr: str(v['nameAr']),
        descriptionEn: str(v['descriptionEn']) || null,
        descriptionAr: str(v['descriptionAr']) || null,
        sortOrder: Number(numOrNull(v['sortOrder']) ?? 0),
      }),
  };
}

// ── items (D12 / D16) ─────────────────────────────────────────────────────────

const isNumber = (v: DefValues) => Number(v['dataType']) === SiteItemDataType.Number;
const isText = (v: DefValues) => Number(v['dataType']) === SiteItemDataType.Text;

function checkLimits(v: DefValues, t: T, out: Record<string, string>): void {
  const min = numOrNull(v['minValue']);
  const max = numOrNull(v['maxValue']);
  if (isNumber(v)) {
    for (const [k, n] of [
      ['minValue', min],
      ['maxValue', max],
    ] as const) {
      if (n !== null && (!Number.isFinite(n) || Math.abs(n) >= NUMBER_ABS_MAX))
        out[k] = t('sv.err.limitRange');
    }
    if (min !== null && max !== null && min > max) out['maxValue'] = t('sv.err.minMax');
  }
  if (isText(v)) {
    const ml = numOrNull(v['maxLength']);
    if (ml !== null && (!Number.isInteger(ml) || ml < 1 || ml > TEXT_VALUE_MAX))
      out['maxLength'] = t('sv.err.maxLength');
    if (str(v['regexPattern']).length > DEF_REGEX_MAX) out['regexPattern'] = t('sv.err.regexLong');
  }
}

/** Limits are sent only for their type (anything else is `sites.LimitNotLegalForType`). */
function limitsOf(
  v: DefValues,
): Pick<UpdateSiteItemRequest, 'minValue' | 'maxValue' | 'maxLength' | 'regexPattern'> {
  return {
    minValue: isNumber(v) ? numOrNull(v['minValue']) : null,
    maxValue: isNumber(v) ? numOrNull(v['maxValue']) : null,
    maxLength: isText(v) ? numOrNull(v['maxLength']) : null,
    regexPattern: isText(v) ? str(v['regexPattern']) || null : null,
  };
}

function limitFields(t: T): DefField[] {
  return [
    {
      key: 'minValue',
      label: t('sv.minValue'),
      kind: 'number',
      hint: t('sv.numberOnly'),
      show: isNumber,
    },
    {
      key: 'maxValue',
      label: t('sv.maxValue'),
      kind: 'number',
      hint: t('sv.numberOnly'),
      show: isNumber,
    },
    {
      key: 'maxLength',
      label: t('sv.maxLength'),
      kind: 'number',
      hint: t('sv.textOnly'),
      show: isText,
    },
    {
      key: 'regexPattern',
      label: t('sv.regex'),
      kind: 'text',
      dir: 'ltr',
      hint: t('sv.textOnly'),
      show: isText,
    },
  ];
}

export function newItemForm(t: T, save: Save<CreateSiteItemRequest>): DefFormData {
  return {
    title: t('sv.newItem'),
    submitLabel: t('sv.create'),
    fields: [
      {
        key: 'code',
        label: t('sv.code'),
        kind: 'text',
        required: true,
        dir: 'ltr',
        hint: t('sv.codeHintItemApi'),
      },
      {
        key: 'dataType',
        label: t('sv.dataType'),
        kind: 'select',
        required: true,
        options: dataTypeOptions(t),
      },
      { key: 'nameEn', label: t('sv.nameEn'), kind: 'text', required: true, dir: 'ltr' },
      { key: 'nameAr', label: t('sv.nameAr'), kind: 'text', required: true, dir: 'rtl' },
      { key: 'unit', label: t('sv.unit'), kind: 'text', dir: 'ltr' },
      {
        key: 'tolerance',
        label: t('sv.tolerance'),
        kind: 'number',
        hint: t('sv.toleranceHint'),
        show: isNumber,
      },
      ...limitFields(t),
    ],
    initial: {
      code: '',
      dataType: SiteItemDataType.Number,
      nameEn: '',
      nameAr: '',
      unit: '',
      tolerance: 0,
    },
    validate: (v) => {
      const out: Record<string, string> = {};
      checkCode(v, t, out);
      checkNames(v, t, out);
      if (str(v['unit']).length > DEF_UNIT_MAX) out['unit'] = t('sv.err.unitLong');
      const tol = numOrNull(v['tolerance']);
      if (isNumber(v) && tol !== null && (!Number.isFinite(tol) || tol < 0))
        out['tolerance'] = t('sv.err.tolerance');
      checkLimits(v, t, out);
      return out;
    },
    save: (v) =>
      save({
        code: str(v['code']),
        nameEn: str(v['nameEn']),
        nameAr: str(v['nameAr']),
        dataType: Number(v['dataType']) as SiteItemDataType,
        unit: str(v['unit']) || null,
        tolerance: isNumber(v) ? (numOrNull(v['tolerance']) ?? 0) : 0,
        ...limitsOf(v),
      }),
  };
}

export function editItemForm(t: T, item: SiteItem, save: Save<UpdateSiteItemRequest>): DefFormData {
  const locked = item.isSystem;
  return {
    title: t('sv.editItem'),
    subtitle: item.code,
    submitLabel: t('sv.saveChanges'),
    note: locked ? t('sv.systemNamesLocked') : undefined,
    fields: [
      {
        key: 'nameEn',
        label: t('sv.nameEn'),
        kind: 'text',
        required: true,
        disabled: locked,
        dir: 'ltr',
      },
      {
        key: 'nameAr',
        label: t('sv.nameAr'),
        kind: 'text',
        required: true,
        disabled: locked,
        dir: 'rtl',
      },
      ...limitFields(t),
    ],
    initial: {
      dataType: item.dataType,
      nameEn: item.nameEn,
      nameAr: item.nameAr,
      minValue: item.minValue,
      maxValue: item.maxValue,
      maxLength: item.maxLength,
      regexPattern: item.regexPattern ?? '',
    },
    validate: (v) => {
      const out: Record<string, string> = {};
      checkNames(v, t, out);
      checkLimits(v, t, out);
      return out;
    },
    save: (v) => save({ nameEn: str(v['nameEn']), nameAr: str(v['nameAr']), ...limitsOf(v) }),
  };
}

/** D17: code, type, unit, tolerance — frozen once values exist (`sites.ItemLocked`). */
export function shapeForm(
  t: T,
  item: SiteItem,
  captured: boolean,
  save: Save<ChangeSiteItemShapeRequest>,
): DefFormData {
  return {
    title: t('sv.changeShape'),
    subtitle: item.code,
    submitLabel: t('sv.saveChanges'),
    note: t(captured ? 'sv.note.shapeLocked' : 'sv.note.shapeFree'),
    noteTone: captured ? 'warning' : 'info',
    fields: [
      { key: 'code', label: t('sv.code'), kind: 'text', required: true, dir: 'ltr' },
      {
        key: 'dataType',
        label: t('sv.dataType'),
        kind: 'select',
        required: true,
        options: dataTypeOptions(t),
      },
      { key: 'unit', label: t('sv.unit'), kind: 'text', dir: 'ltr' },
      {
        key: 'tolerance',
        label: t('sv.tolerance'),
        kind: 'number',
        hint: t('sv.toleranceHint'),
        show: isNumber,
      },
    ],
    initial: {
      code: item.code,
      dataType: item.dataType,
      unit: item.unit ?? '',
      tolerance: item.tolerance,
    },
    validate: (v) => {
      const out: Record<string, string> = {};
      checkCode(v, t, out);
      if (str(v['unit']).length > DEF_UNIT_MAX) out['unit'] = t('sv.err.unitLong');
      const tol = isNumber(v) ? numOrNull(v['tolerance']) : null;
      if (tol !== null && (!Number.isFinite(tol) || tol < 0))
        out['tolerance'] = t('sv.err.tolerance');
      // D17 keeps the stored limits and re-checks them against the new type
      // (SiteItem.ChangeCapturedShape → ValidateLimits, SiteItem.cs:129-147,239-272).
      const numberLimits = item.minValue !== null || item.maxValue !== null;
      const textLimits = item.maxLength !== null || !!item.regexPattern;
      if ((!isNumber(v) && numberLimits) || (!isText(v) && textLimits))
        out['dataType'] = t('sv.err.shapeLimits');
      return out;
    },
    save: (v) =>
      save({
        code: str(v['code']),
        dataType: Number(v['dataType']) as SiteItemDataType,
        unit: str(v['unit']) || null,
        tolerance: isNumber(v) ? (numOrNull(v['tolerance']) ?? 0) : 0,
      }),
  };
}

/** D20 add / D13 edit an option (code only on add). */
export function optionForm(
  t: T,
  item: SiteItem,
  option: SiteItemOption | null,
  save: Save<{ code: string; nameEn: string; nameAr: string; sortOrder: number }>,
): DefFormData {
  return {
    title: t(option ? 'sv.editOption' : 'sv.addOption'),
    subtitle: option ? `${item.code} · ${option.code}` : item.code,
    submitLabel: t(option ? 'sv.saveChanges' : 'sv.create'),
    fields: [
      {
        key: 'code',
        label: t('sv.code'),
        kind: 'text',
        required: true,
        disabled: !!option,
        dir: 'ltr',
      },
      { key: 'sortOrder', label: t('sv.sortOrder'), kind: 'number', required: true },
      { key: 'nameEn', label: t('sv.nameEn'), kind: 'text', required: true, dir: 'ltr' },
      { key: 'nameAr', label: t('sv.nameAr'), kind: 'text', required: true, dir: 'rtl' },
    ],
    initial: {
      code: option?.code ?? '',
      sortOrder: option?.sortOrder ?? item.options.length + 1,
      nameEn: option?.nameEn ?? '',
      nameAr: option?.nameAr ?? '',
    },
    validate: (v) => {
      const out: Record<string, string> = {};
      if (!option) checkCode(v, t, out);
      checkNames(v, t, out);
      checkSort(v, t, out);
      return out;
    },
    save: (v) =>
      save({
        code: str(v['code']),
        nameEn: str(v['nameEn']),
        nameAr: str(v['nameAr']),
        sortOrder: Number(numOrNull(v['sortOrder']) ?? 0),
      }),
  };
}

/** D7: attach an active, unlinked item with its Required / Visible flags. */
export function attachForm(
  t: T,
  moduleCode: string,
  choices: SelectOption[],
  save: Save<{ itemId: string; isRequired: boolean; isVisible: boolean }>,
): DefFormData {
  return {
    title: t('sv.attachItem'),
    subtitle: moduleCode,
    submitLabel: t('sv.attach'),
    note: choices.length ? undefined : t('sv.allLinked'),
    fields: [
      {
        key: 'itemId',
        label: t('sv.item'),
        kind: 'select',
        required: true,
        options: choices,
        wide: true,
      },
      { key: 'isRequired', label: t('sv.required'), kind: 'checkbox' },
      { key: 'isVisible', label: t('sv.visible'), kind: 'checkbox' },
    ],
    initial: { itemId: null, isRequired: false, isVisible: true },
    validate: (v): Record<string, string> => (v['itemId'] ? {} : { itemId: t('sv.err.pickItem') }),
    save: (v) =>
      save({
        itemId: String(v['itemId']),
        isRequired: !!v['isRequired'],
        isVisible: !!v['isVisible'],
      }),
  };
}

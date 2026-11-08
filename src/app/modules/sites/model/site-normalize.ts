import { readField } from '@platform/http/api.service';
import {
  BuildingKind,
  ElevatorStatus,
  SiteDocumentKind,
  SiteItemDataType,
  SiteStatus,
  UnitCondition,
  UnitPosition,
  UnitType,
  toEnumInt,
} from './site-enums';
import type {
  SiteBoq,
  SiteDetail,
  SiteDocumentLink,
  SiteFamilies,
  SiteGrouped,
  SiteListItem,
  SitePage,
  SitePivot,
  SitePivotCell,
  SitePivotRow,
  SiteRecord,
  SiteUnitData,
} from './site.model';
import type {
  SiteItem,
  SiteItemOption,
  SiteItemUsage,
  SiteModule,
  SiteModuleSchema,
  SiteSchemaField,
} from './site-definition.model';

/** sites S-1: wire → model normalizers (case-insensitive reads, enums to ints, nulls kept). */

const str = (o: unknown, k: string): string => {
  const v = readField<unknown>(o, k);
  return typeof v === 'string' ? v : v == null ? '' : String(v);
};
const strN = (o: unknown, k: string): string | null => {
  const v = readField<unknown>(o, k);
  return typeof v === 'string' ? v : v == null ? null : String(v);
};
const num = (o: unknown, k: string): number => {
  const v = readField<unknown>(o, k);
  return typeof v === 'number' ? v : Number(v ?? 0) || 0;
};
const numN = (o: unknown, k: string): number | null => {
  const v = readField<unknown>(o, k);
  if (v == null || v === '') return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
};
const boolN = (o: unknown, k: string): boolean | null => {
  const v = readField<unknown>(o, k);
  return typeof v === 'boolean' ? v : null;
};
const bool = (o: unknown, k: string, dflt = false): boolean => boolN(o, k) ?? dflt;
const arr = (o: unknown, k: string): unknown[] => {
  const v = readField<unknown>(o, k);
  return Array.isArray(v) ? v : [];
};
/** A `DateOnly` read; tolerate a full timestamp by keeping its date part. */
const dateOnly = (o: unknown, k: string): string | null => {
  const v = strN(o, k);
  return v ? v.slice(0, 10) : null;
};

export function normalizeUnitData(o: unknown): SiteUnitData {
  return {
    address: strN(o, 'address'),
    unitType: toEnumInt(UnitType, readField(o, 'unitType')),
    unitCondition: toEnumInt(UnitCondition, readField(o, 'unitCondition')),
    areaSqm: numN(o, 'areaSqm'),
    floorNo: numN(o, 'floorNo'),
    unitsPerFloor: numN(o, 'unitsPerFloor'),
    buildingKind: toEnumInt(BuildingKind, readField(o, 'buildingKind')),
    position: toEnumInt(UnitPosition, readField(o, 'position')),
    elevatorStatus: toEnumInt(ElevatorStatus, readField(o, 'elevatorStatus')),
    isLicensed: boolN(o, 'isLicensed'),
    isRented: boolN(o, 'isRented'),
    utilityMetersNote: strN(o, 'utilityMetersNote'),
    surveyedOn: dateOnly(o, 'surveyedOn'),
    notes: strN(o, 'notes'),
  };
}

export function normalizeListItem(o: unknown): SiteListItem {
  return {
    id: str(o, 'id'),
    code: str(o, 'code'),
    status: toEnumInt(SiteStatus, readField(o, 'status')) ?? SiteStatus.Draft,
    address: strN(o, 'address'),
    surveyedOn: dateOnly(o, 'surveyedOn'),
    createdAtUtc: str(o, 'createdAtUtc'),
  };
}

export function normalizePage(o: unknown): SitePage {
  return {
    items: arr(o, 'items').map(normalizeListItem),
    pageNumber: num(o, 'pageNumber') || 1,
    pageSize: num(o, 'pageSize'),
    totalCount: num(o, 'totalCount'),
    totalPages: num(o, 'totalPages'),
  };
}

export function normalizeDetail(o: unknown): SiteDetail {
  return {
    ...normalizeUnitData(o),
    id: str(o, 'id'),
    projectId: str(o, 'projectId'),
    code: str(o, 'code'),
    status: toEnumInt(SiteStatus, readField(o, 'status')) ?? SiteStatus.Draft,
    createdById: str(o, 'createdById'),
    submittedAtUtc: strN(o, 'submittedAtUtc'),
    decidedAtUtc: strN(o, 'decidedAtUtc'),
    decidedById: strN(o, 'decidedById'),
    decisionNote: strN(o, 'decisionNote'),
    isActive: bool(o, 'isActive', true),
    createdAtUtc: str(o, 'createdAtUtc'),
    recordCounts: arr(o, 'recordCounts').map((r) => ({
      moduleId: str(r, 'moduleId'),
      code: str(r, 'code'),
      recordCount: num(r, 'recordCount'),
    })),
  };
}

export function normalizeOption(o: unknown): SiteItemOption {
  return {
    id: str(o, 'id'),
    code: str(o, 'code'),
    nameEn: str(o, 'nameEn'),
    nameAr: str(o, 'nameAr'),
    sortOrder: num(o, 'sortOrder'),
    isActive: bool(o, 'isActive', true),
  };
}

const dataType = (o: unknown) =>
  toEnumInt(SiteItemDataType, readField(o, 'dataType')) ?? SiteItemDataType.Text;

export function normalizeField(o: unknown): SiteSchemaField {
  return {
    linkId: str(o, 'linkId'),
    itemId: str(o, 'itemId'),
    code: str(o, 'code'),
    nameEn: str(o, 'nameEn'),
    nameAr: str(o, 'nameAr'),
    dataType: dataType(o),
    unit: strN(o, 'unit'),
    minValue: numN(o, 'minValue'),
    maxValue: numN(o, 'maxValue'),
    tolerance: num(o, 'tolerance'),
    maxLength: numN(o, 'maxLength'),
    regexPattern: strN(o, 'regexPattern'),
    isRequired: bool(o, 'isRequired'),
    isVisible: bool(o, 'isVisible', true),
    sortOrder: num(o, 'sortOrder'),
    options: arr(o, 'options').map(normalizeOption),
  };
}

export function normalizeCell(o: unknown): SitePivotCell | null {
  if (!o || typeof o !== 'object') return null;
  return {
    valueNumber: numN(o, 'valueNumber'),
    valueText: strN(o, 'valueText'),
    valueBool: boolN(o, 'valueBool'),
    valueDate: dateOnly(o, 'valueDate'),
    optionId: strN(o, 'optionId'),
    optionCode: strN(o, 'optionCode'),
    optionNameEn: strN(o, 'optionNameEn'),
    optionNameAr: strN(o, 'optionNameAr'),
  };
}

function normalizePivotRow(o: unknown): SitePivotRow {
  const raw = readField<Record<string, unknown>>(o, 'cells') ?? {};
  const cells: Record<string, SitePivotCell | null> = {};
  for (const [code, cell] of Object.entries(raw)) cells[code] = normalizeCell(cell);
  return {
    recordId: str(o, 'recordId'),
    label: str(o, 'label'),
    spaceId: strN(o, 'spaceId'),
    spaceName: strN(o, 'spaceName'),
    sortOrder: num(o, 'sortOrder'),
    note: strN(o, 'note'),
    cells,
  };
}

export function normalizePivot(o: unknown): SitePivot {
  return {
    siteId: str(o, 'siteId'),
    moduleId: str(o, 'moduleId'),
    moduleCode: str(o, 'moduleCode'),
    columns: arr(o, 'columns').map(normalizeField),
    rows: arr(o, 'rows').map(normalizePivotRow),
  };
}

export function normalizeRecord(o: unknown): SiteRecord {
  return {
    id: str(o, 'id'),
    moduleId: str(o, 'moduleId'),
    label: str(o, 'label'),
    spaceId: strN(o, 'spaceId'),
    spaceName: strN(o, 'spaceName'),
    catalogItemId: strN(o, 'catalogItemId'),
    sortOrder: num(o, 'sortOrder'),
    note: strN(o, 'note'),
  };
}

export function normalizeGrouped(o: unknown): SiteGrouped {
  return {
    siteId: str(o, 'siteId'),
    groups: arr(o, 'groups').map((g) => ({
      spaceId: strN(g, 'spaceId'),
      spaceName: str(g, 'spaceName'),
      records: arr(g, 'records').map(normalizeRecord),
    })),
  };
}

export function normalizeFamilies(o: unknown): SiteFamilies {
  return {
    siteId: str(o, 'siteId'),
    moduleId: str(o, 'moduleId'),
    groupBy: arr(o, 'groupBy').map(String),
    families: arr(o, 'families').map((f) => ({
      familyKey: str(f, 'familyKey'),
      instances: num(f, 'instances'),
      spaceCount: num(f, 'spaceCount'),
      members: arr(f, 'members').map(String),
    })),
  };
}

export function normalizeBoq(o: unknown): SiteBoq {
  return {
    siteId: str(o, 'siteId'),
    lines: arr(o, 'lines').map((l) => ({
      moduleCode: str(l, 'moduleCode'),
      kindCode: str(l, 'kindCode'),
      nameEn: str(l, 'nameEn'),
      nameAr: str(l, 'nameAr'),
      occurrences: num(l, 'occurrences'),
      spaces: num(l, 'spaces'),
      totalQty: numN(l, 'totalQty'),
      totalAreaSqm: numN(l, 'totalAreaSqm'),
      totalLengthM: numN(l, 'totalLengthM'),
    })),
  };
}

export function normalizeDocumentLink(o: unknown): SiteDocumentLink {
  return {
    id: str(o, 'id'),
    documentId: str(o, 'documentId'),
    siteId: strN(o, 'siteId'),
    recordId: strN(o, 'recordId'),
    kind: toEnumInt(SiteDocumentKind, readField(o, 'kind')) ?? SiteDocumentKind.Photo,
    addedById: str(o, 'addedById'),
    createdAtUtc: str(o, 'createdAtUtc'),
  };
}

export function normalizeModule(o: unknown): SiteModule {
  return {
    id: str(o, 'id'),
    code: str(o, 'code'),
    nameEn: str(o, 'nameEn'),
    nameAr: str(o, 'nameAr'),
    descriptionEn: strN(o, 'descriptionEn'),
    descriptionAr: strN(o, 'descriptionAr'),
    isSystem: bool(o, 'isSystem'),
    sortOrder: num(o, 'sortOrder'),
    isActive: bool(o, 'isActive', true),
  };
}

export function normalizeSchema(o: unknown): SiteModuleSchema {
  return {
    moduleId: str(o, 'moduleId'),
    code: str(o, 'code'),
    nameEn: str(o, 'nameEn'),
    nameAr: str(o, 'nameAr'),
    descriptionEn: strN(o, 'descriptionEn'),
    descriptionAr: strN(o, 'descriptionAr'),
    sortOrder: num(o, 'sortOrder'),
    fields: arr(o, 'fields').map(normalizeField),
  };
}

export function normalizeItem(o: unknown): SiteItem {
  return {
    id: str(o, 'id'),
    code: str(o, 'code'),
    nameEn: str(o, 'nameEn'),
    nameAr: str(o, 'nameAr'),
    dataType: dataType(o),
    unit: strN(o, 'unit'),
    minValue: numN(o, 'minValue'),
    maxValue: numN(o, 'maxValue'),
    tolerance: num(o, 'tolerance'),
    maxLength: numN(o, 'maxLength'),
    regexPattern: strN(o, 'regexPattern'),
    isSystem: bool(o, 'isSystem'),
    isActive: bool(o, 'isActive', true),
    options: arr(o, 'options').map(normalizeOption),
  };
}

export function normalizeUsage(o: unknown): SiteItemUsage {
  return {
    itemId: str(o, 'itemId'),
    code: str(o, 'code'),
    hasCapturedValues: bool(o, 'hasCapturedValues'),
    capturedValueCount: num(o, 'capturedValueCount'),
    modules: arr(o, 'modules').map((m) => ({
      moduleId: str(m, 'moduleId'),
      code: str(m, 'code'),
      isRequired: bool(m, 'isRequired'),
      isActive: bool(m, 'isActive', true),
    })),
  };
}

/** Pick the name in the UI language (payload data, never a catalog string). */
export function localName(o: { nameEn: string; nameAr: string }, locale: string): string {
  return locale === 'ar' ? o.nameAr || o.nameEn : o.nameEn || o.nameAr;
}

import type { SiteSchemaField } from '../model/site-definition.model';
import type { SitePivotCell, SitePivotRow } from '../model/site.model';
import { EMPTY_UNIT_DATA, type SiteDetail } from '../model/site.model';

/** Test fixtures shared by the sites specs (imported by specs only). */
export function detail(patch: Partial<SiteDetail> = {}): SiteDetail {
  return {
    ...EMPTY_UNIT_DATA,
    id: 'S1',
    projectId: 'P',
    code: 'SITE-00001',
    status: 1,
    createdById: 'E-creator',
    submittedAtUtc: null,
    submittedById: null,
    decidedAtUtc: null,
    decidedById: null,
    decisionNote: null,
    isActive: true,
    createdAtUtc: '2026-11-01T08:00:00Z',
    recordCounts: [],
    ...patch,
  };
}

export function field(patch: Partial<SiteSchemaField>): SiteSchemaField {
  return {
    linkId: `L-${patch.code ?? 'f'}`,
    itemId: `I-${patch.code ?? 'f'}`,
    code: 'f',
    nameEn: patch.code ?? 'Field',
    nameAr: 'حقل',
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
  };
}

export function cell(patch: Partial<SitePivotCell>): SitePivotCell {
  return {
    valueNumber: null,
    valueText: null,
    valueBool: null,
    valueDate: null,
    optionId: null,
    optionCode: null,
    optionNameEn: null,
    optionNameAr: null,
    ...patch,
  };
}

export function pivotRow(patch: Partial<SitePivotRow>): SitePivotRow {
  return {
    recordId: 'R1',
    label: 'D-01',
    spaceId: null,
    spaceName: null,
    sortOrder: 1,
    note: null,
    cells: {},
    ...patch,
  };
}

/** A module: width (Number, visible, required, 10..400), kind (Select, visible), secret (Text, HIDDEN),
 *  finish (Select, HIDDEN). */
export const OPT_A = {
  id: 'O-a',
  code: 'a',
  nameEn: 'Single',
  nameAr: 'مفرد',
  sortOrder: 1,
  isActive: true,
};
export const OPT_B = {
  id: 'O-b',
  code: 'b',
  nameEn: 'Double',
  nameAr: 'مزدوج',
  sortOrder: 2,
  isActive: true,
};
export const OPT_OLD = {
  id: 'O-old',
  code: 'old',
  nameEn: 'Old',
  nameAr: 'قديم',
  sortOrder: 3,
  isActive: false,
};
export const WIDTH = field({
  code: 'width_cm',
  unit: 'cm',
  isRequired: true,
  minValue: 10,
  maxValue: 400,
  sortOrder: 1,
});
export const KIND = field({ code: 'kind', dataType: 4, sortOrder: 2, options: [OPT_A, OPT_B] });
export const SECRET = field({ code: 'secret', dataType: 2, isVisible: false, sortOrder: 3 });
export const FINISH = field({
  code: 'finish',
  dataType: 4,
  isVisible: false,
  sortOrder: 4,
  options: [OPT_A],
});
export const FIELDS = [WIDTH, KIND, SECRET, FINISH];

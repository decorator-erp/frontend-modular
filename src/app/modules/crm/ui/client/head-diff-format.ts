import type { CatalogService } from '@platform/i18n/catalog.service';
import type { CatalogKey } from '@platform/i18n/catalog/en';
import { HiringReason } from '../../model/crm-enums';
import {
  BUILDING_KIND_KEYS,
  ELEVATOR_KEYS,
  EXPERIENCE_KEYS,
  FINISHING_PURPOSE_KEYS,
  FURNITURE_KEYS,
  POSITION_KEYS,
  TIMELINE_KEYS,
  UNIT_CONDITION_KEYS,
  UNIT_TYPE_KEYS,
} from '../brief/brief-head.component';

/**
 * Formats one `BriefHeadFieldChange`'s raw wire value into a human sentence — never
 * shown a bare integer or a lowercase `"true"` (T119/FR-029). Mirrors
 * `GetBriefHeadDiffQuery.Flatten` EXACTLY (verified against the backend working
 * tree): enums as bare-integer strings, bools as lowercase `"true"`/`"false"`,
 * `HiringReasons` as its `[Flags]` bitmask, everything else as a plain scalar.
 * `null` ⇒ the field was empty at that round — rendered as an em dash, the
 * established placeholder (matches `client.*`'s existing `'—'` precedent).
 *
 * Reused as-is by the designer profile (T121, B6c) to render the confirmed brief
 * head's fields — that screen adapts its typed `DesignProfileBriefHead` into the
 * same `{field, raw}` shape rather than duplicating this translation table a
 * third time. `ExpectedBudget` is harmless to keep listed here (the approvals
 * inbox's office-side diff legitimately shows it); `DesignProfileBriefHead` simply
 * has no such property, so the designer profile can never emit that field at all.
 */

const ENUM_FIELD_KEYS: Partial<Record<string, Record<number, CatalogKey>>> = {
  UnitType: UNIT_TYPE_KEYS,
  UnitCondition: UNIT_CONDITION_KEYS,
  BuildingKind: BUILDING_KIND_KEYS,
  Position: POSITION_KEYS,
  ElevatorStatus: ELEVATOR_KEYS,
  DesignerExperience: EXPERIENCE_KEYS,
  FurnitureStatus: FURNITURE_KEYS,
  TimelinePressure: TIMELINE_KEYS,
  FinishingPurpose: FINISHING_PURPOSE_KEYS,
};

const BOOL_FIELDS = new Set([
  'IsLicensed',
  'ReceivesFrequentVisitors',
  'HobbiesInDesign',
  'UsedDesignerBefore',
]);

const HIRING_REASON_KEYS: Record<Exclude<HiringReason, HiringReason.None>, CatalogKey> = {
  [HiringReason.ReliefFromCraftsmen]: 'brief.optHiringRelief',
  [HiringReason.SaveMoneyAndTime]: 'brief.optHiringSaveTime',
  [HiringReason.OrganizeAndComfort]: 'brief.optHiringOrganize',
};

/** The exact PascalCase property names `Flatten()` emits, mapped to their label key. */
export const HEAD_DIFF_FIELD_KEYS: Record<string, CatalogKey> = {
  UnitType: 'brief.fUnitType',
  UnitCondition: 'brief.fCondition',
  Address: 'brief.fAddress',
  FloorNo: 'brief.fFloorNo',
  UnitsPerFloor: 'brief.fUnitsPerFloor',
  AreaSqm: 'brief.fArea',
  BuildingKind: 'brief.fBuildingKind',
  IsLicensed: 'brief.fFloorLic',
  IsRented: 'brief.fTenure',
  FinishingPurpose: 'brief.fFinishingPurpose',
  Position: 'brief.fPosition',
  ElevatorStatus: 'brief.fElevator',
  UtilityMetersNote: 'brief.fUtilityMeters',
  ReceivesFrequentVisitors: 'brief.fVisitorsFreq',
  VisitorsNote: 'brief.fVisitorsNote',
  ParentsHobbies: 'brief.fParentsHobbies',
  ChildrenHobbies: 'brief.fChildrenHobbies',
  HobbiesInDesign: 'brief.fHobbiesInDesign',
  UsedDesignerBefore: 'brief.fUsedBefore',
  DesignerExperience: 'brief.fExperience',
  DesignerExperienceReason: 'brief.fDesignerExpReason',
  HiringReasons: 'brief.fHiring',
  PreferredStyle: 'brief.fStyle',
  PreferredColors: 'brief.fColors',
  FurnitureStatus: 'brief.fFurniture',
  ExpectedBudget: 'brief.fBudget',
  TimelinePressure: 'brief.fTimeline',
  ArchitecturalRequests: 'brief.secArch',
  OtherNeeds: 'brief.fOtherNeeds',
  LastMeetingId: 'brief.fLastMeeting',
};

export function headDiffFieldLabel(field: string, catalog: CatalogService): string {
  const key = HEAD_DIFF_FIELD_KEYS[field];
  return key ? catalog.t(key) : field;
}

export function formatHeadDiffValue(
  field: string,
  raw: string | null,
  catalog: CatalogService,
): string {
  if (raw === null || raw === '') return '—';

  const enumKeys = ENUM_FIELD_KEYS[field];
  if (enumKeys) {
    const key = enumKeys[Number(raw)];
    return key ? catalog.t(key) : raw;
  }

  if (field === 'HiringReasons') {
    const mask = Number(raw);
    if (mask === HiringReason.None || Number.isNaN(mask)) return '—';
    const labels = Object.keys(HIRING_REASON_KEYS)
      .map(Number)
      .filter((bit) => (mask & bit) === bit)
      .map((bit) => catalog.t(HIRING_REASON_KEYS[bit as Exclude<HiringReason, HiringReason.None>]));
    return labels.length ? labels.join(', ') : '—';
  }

  if (field === 'IsRented') {
    return catalog.t(raw === 'true' ? 'tenure.rent' : 'tenure.own');
  }

  if (BOOL_FIELDS.has(field)) {
    return catalog.t(raw === 'true' ? 'common.yes' : 'common.no');
  }

  return raw;
}

import type {
  BuildingKind,
  ElevatorStatus,
  SiteDocumentKind,
  SiteStatus,
  UnitCondition,
  UnitPosition,
  UnitType,
} from './site-enums';
import type { SiteSchemaField } from './site-definition.model';

/**
 * sites S-1: the survey, record and document shapes of `Sites.Contracts` (dms
 * `Surveys/SiteContracts.cs`, `Records/RecordContracts.cs`, `Documents/DocumentContracts.cs`).
 * Dates: `DateOnly` members (`surveyedOn`, `valueDate`) are `YYYY-MM-DD`; `DateTime` members are ISO UTC.
 */

/** `SiteUnitDataRequest` (`SiteContracts.cs:13-27`): all optional; a PUT replaces the whole set. */
export interface SiteUnitData {
  address: string | null;
  unitType: UnitType | null;
  unitCondition: UnitCondition | null;
  areaSqm: number | null;
  floorNo: number | null;
  unitsPerFloor: number | null;
  buildingKind: BuildingKind | null;
  position: UnitPosition | null;
  elevatorStatus: ElevatorStatus | null;
  isLicensed: boolean | null;
  isRented: boolean | null;
  utilityMetersNote: string | null;
  /** `DateOnly`, `YYYY-MM-DD`. */
  surveyedOn: string | null;
  notes: string | null;
}

export const EMPTY_UNIT_DATA: SiteUnitData = {
  address: null,
  unitType: null,
  unitCondition: null,
  areaSqm: null,
  floorNo: null,
  unitsPerFloor: null,
  buildingKind: null,
  position: null,
  elevatorStatus: null,
  isLicensed: null,
  isRented: null,
  utilityMetersNote: null,
  surveyedOn: null,
  notes: null,
};

/** `SiteListItemResponse` (`SiteContracts.cs:37-39`). */
export interface SiteListItem {
  id: string;
  code: string;
  status: SiteStatus;
  address: string | null;
  surveyedOn: string | null;
  createdAtUtc: string;
}

/** `PagedResult<SiteListItemResponse>`: `{items, pageNumber, pageSize, totalCount, totalPages}`. */
export interface SitePage {
  items: SiteListItem[];
  pageNumber: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
}

export interface SiteListQuery {
  projectId: string;
  status?: SiteStatus | null;
  pageIndex?: number;
  pageSize?: number;
}

export interface SiteModuleRecordCount {
  moduleId: string;
  code: string;
  recordCount: number;
}

/** `SiteDetailResponse` (`SiteContracts.cs:47-55`). No `submittedById` (DEVIATION-S1, BF-2). */
export interface SiteDetail extends SiteUnitData {
  id: string;
  projectId: string;
  code: string;
  status: SiteStatus;
  createdById: string;
  submittedAtUtc: string | null;
  decidedAtUtc: string | null;
  decidedById: string | null;
  decisionNote: string | null;
  isActive: boolean;
  createdAtUtc: string;
  recordCounts: SiteModuleRecordCount[];
}

/** `SitePivotCellResponse` (`RecordContracts.cs:60-62`). */
export interface SitePivotCell {
  valueNumber: number | null;
  valueText: string | null;
  valueBool: boolean | null;
  valueDate: string | null;
  optionId: string | null;
  optionCode: string | null;
  optionNameEn: string | null;
  optionNameAr: string | null;
}

/** `SitePivotRowResponse` (`RecordContracts.cs:56-58`). `cells` is keyed by item code. */
export interface SitePivotRow {
  recordId: string;
  label: string;
  spaceId: string | null;
  spaceName: string | null;
  sortOrder: number;
  note: string | null;
  cells: Record<string, SitePivotCell | null>;
}

/** `SitePivotResponse` (`RecordContracts.cs:64-66`): `columns` includes hidden fields. */
export interface SitePivot {
  siteId: string;
  moduleId: string;
  moduleCode: string;
  columns: SiteSchemaField[];
  rows: SitePivotRow[];
}

/** `SiteRecordResponse` (`RecordContracts.cs:52-54`). */
export interface SiteRecord {
  id: string;
  moduleId: string;
  label: string;
  spaceId: string | null;
  spaceName: string | null;
  catalogItemId: string | null;
  sortOrder: number;
  note: string | null;
}

/** `SiteSpaceGroupResponse`: null `spaceId` = "Whole unit", last. */
export interface SiteSpaceGroup {
  spaceId: string | null;
  spaceName: string;
  records: SiteRecord[];
}

export interface SiteGrouped {
  siteId: string;
  groups: SiteSpaceGroup[];
}

/** `SiteValueRequest` (`RecordContracts.cs:22-28`): exactly one value member set. */
export interface SiteValueRequest {
  itemId: string;
  valueNumber?: number | null;
  valueText?: string | null;
  valueBool?: boolean | null;
  /** `DateOnly`, `YYYY-MM-DD`. */
  valueDate?: string | null;
  optionId?: string | null;
}

/** `CreateSiteRecordRequest` (`RecordContracts.cs:8-10`). */
export interface CreateSiteRecordRequest {
  moduleId: string;
  label: string;
  spaceId?: string | null;
  catalogItemId?: string | null;
  sortOrder?: number;
  note?: string | null;
}

/** `UpdateSiteRecordRequest` (`RecordContracts.cs:18-19`). */
export interface UpdateSiteRecordRequest {
  label: string;
  spaceId: string | null;
  catalogItemId: string | null;
  sortOrder: number;
  note: string | null;
}

/** `BulkSiteRecordRequest` (`RecordContracts.cs:44-46`): `recordId` null = insert. */
export interface BulkSiteRecordRequest {
  recordId: string | null;
  moduleId: string;
  label: string;
  spaceId: string | null;
  catalogItemId: string | null;
  sortOrder: number;
  note: string | null;
  values: SiteValueRequest[];
}

/** `SiteFamilyResponse`: `familyKey` is opaque — compare only, never parse. */
export interface SiteFamily {
  familyKey: string;
  instances: number;
  spaceCount: number;
  members: string[];
}

export interface SiteFamilies {
  siteId: string;
  moduleId: string;
  groupBy: string[];
  families: SiteFamily[];
}

export interface SiteBoqLine {
  moduleCode: string;
  kindCode: string;
  nameEn: string;
  nameAr: string;
  occurrences: number;
  spaces: number;
  totalQty: number | null;
  totalAreaSqm: number | null;
  totalLengthM: number | null;
}

export interface SiteBoq {
  siteId: string;
  lines: SiteBoqLine[];
}

/** `SiteDocumentResponse` (`DocumentContracts.cs:18-20`). */
export interface SiteDocumentLink {
  id: string;
  documentId: string;
  siteId: string | null;
  recordId: string | null;
  kind: SiteDocumentKind;
  addedById: string;
  createdAtUtc: string;
}

/** `LinkSiteDocumentRequest`: null `recordId` = the whole survey. */
export interface LinkSiteDocumentRequest {
  documentId: string;
  kind: SiteDocumentKind;
  recordId?: string | null;
}

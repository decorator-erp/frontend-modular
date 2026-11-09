import type { CreateClientRequest } from '@modules/clients';
import { SCOPE_ERROR_CODES } from '@platform/errors/error-catalog';
import {
  ScopeOfWorkStatus,
  type ScopeOfWork,
  type ScopeOfWorkItem,
  type UpdateScopeOfWorkHeaderRequest,
} from '@modules/projects';
import type { CrmLead } from '../data/crm-lead.service';
import type { LeadIntakeResponse } from './index';

/**
 * LC-1: converting a lead sets up the whole project — the client, a project whose stages come from a
 * confirmed scope of work, and a draft site survey — and links the lead to the client last. Each piece is
 * an existing route in its own backend module, so the wizard runs them in order (`LeadConvertRunner`) and
 * can resume after a failure; there is no cross-module transaction to lean on.
 */

/**
 * The draft survey's unit data — `SiteUnitDataRequest` (dms `Sites.Contracts/Surveys/SiteContracts.cs:13-29`),
 * every field optional. Kept here rather than imported from `@modules/sites` (see `CrmSiteSurveyService`).
 * `unitType` and `unitCondition` use the same values as CRM's `UnitType` / `UnitCondition`.
 */
export interface ConvertSiteData {
  address: string | null;
  unitType: number | null;
  unitCondition: number | null;
  areaSqm: number | null;
  floorNo: number | null;
  unitsPerFloor: number | null;
  buildingKind: number | null;
  position: number | null;
  elevatorStatus: number | null;
  isLicensed: boolean | null;
  isRented: boolean | null;
  utilityMetersNote: string | null;
  surveyedOn: string | null;
  notes: string | null;
}

export const EMPTY_SITE_DATA: ConvertSiteData = {
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

/** The runner's steps, in run order. The lead is converted last, so it stays open until the rest exists. */
export const CONVERT_STEPS = ['client', 'project', 'scope', 'site', 'lead'] as const;
export type ConvertStep = (typeof CONVERT_STEPS)[number];

/** One scope-of-work line as the wizard holds it before the project exists: a template stage, renamed or re-priced. */
export interface ConvertScopeItem {
  sourceStageId: string;
  sourceTemplateName: string | null;
  name: string;
  description: string | null;
  fee: number;
}

export interface ConvertProjectDraft {
  code: string;
  name: string;
  address: string;
  description: string | null;
  /** `YYYY-MM-DD` or null. */
  estimatedStartDate: string | null;
}

export type ConvertClientChoice =
  { mode: 'new'; request: CreateClientRequest } | { mode: 'existing'; clientId: string };

/** Everything the runner needs; built from the wizard's steps on Create. */
export interface ConvertPlan {
  leadId: string;
  client: ConvertClientChoice;
  project: ConvertProjectDraft;
  scope: { header: UpdateScopeOfWorkHeaderRequest; items: ConvertScopeItem[] };
  site: ConvertSiteData;
}

/** What already exists on the server for this lead's conversion; saved after every step so a retry skips it. */
export interface ConvertProgress {
  clientId?: string;
  projectId?: string;
  scopeConfirmed?: boolean;
  siteId?: string;
  converted?: boolean;
}

/** `ScopeOfWork.MaxItems` (Projects.Domain). */
export const SCOPE_MAX_ITEMS = 50;

/** The client step's prefill: the lead's own details, and the intake's home address (else the unit's). */
export function clientDraftFromLead(
  lead: CrmLead,
  intake: LeadIntakeResponse,
): Omit<CreateClientRequest, 'password'> {
  return {
    firstName: lead.firstName,
    lastName: lead.lastName,
    email: lead.email ?? '',
    phone: lead.phone ?? '',
    address: intake.clientAddress ?? intake.unitAddress ?? '',
    notes: lead.notes ?? undefined,
  };
}

/** The project step's prefill: named after the client, at the unit's address. */
export function projectDraftFromLead(
  lead: CrmLead,
  intake: LeadIntakeResponse,
  sectorLabel: string | null,
): ConvertProjectDraft {
  const person = `${lead.firstName} ${lead.lastName}`.trim();
  return {
    code: '',
    name: sectorLabel ? `${person} — ${sectorLabel}` : person,
    address: intake.unitAddress ?? intake.clientAddress ?? '',
    description: null,
    estimatedStartDate: null,
  };
}

/** The site step's prefill: the unit the client described (CRM and Sites share the unit enums' values). */
export function siteDataFromIntake(intake: LeadIntakeResponse): ConvertSiteData {
  const residential = intake.residential ?? null;
  return {
    ...EMPTY_SITE_DATA,
    address: intake.unitAddress ?? null,
    areaSqm: intake.areaSqm ?? null,
    unitType: residential?.unitType ?? null,
    unitCondition: residential?.unitCondition ?? null,
    isLicensed: residential?.isLicensed ?? null,
    isRented: residential?.isRented ?? null,
  };
}

/** `YYYY-MM-DD` plus whole days, in UTC so no time zone shifts the date. */
export function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * The confirm rules of `ScopeOfWork.EnsureConfirmable`, checked before anything is created, as the
 * server's own error codes (so `friendlyMessage` gives the same EN/AR text the scope page shows).
 * `teams.MissingHead` and a deleted template stage only the server can see.
 */
export function scopeBlockers(
  header: UpdateScopeOfWorkHeaderRequest,
  items: readonly ConvertScopeItem[],
): string[] {
  const total = items.reduce((sum, i) => sum + i.fee, 0) + header.adjustmentAmount;
  const rules: [boolean, string][] = [
    [items.length === 0, SCOPE_ERROR_CODES.empty],
    [items.length > SCOPE_MAX_ITEMS, SCOPE_ERROR_CODES.tooManyItems],
    [header.durationDays === null, SCOPE_ERROR_CODES.durationRequired],
    [
      header.adjustmentAmount !== 0 && !header.adjustmentNote?.trim(),
      SCOPE_ERROR_CODES.adjustmentNoteRequired,
    ],
    [total < 0, SCOPE_ERROR_CODES.negativeTotal],
  ];
  return rules.filter(([applies]) => applies).map(([, code]) => code);
}

/**
 * The wizard's scope as the scope page's presentational parts (`SowSummaryComponent`,
 * `SowItemsTableComponent`) read it: a Draft with no id, its items keyed by their template stage, and
 * the totals and end date the server would compute.
 */
export function draftScope(
  header: UpdateScopeOfWorkHeaderRequest,
  items: readonly ConvertScopeItem[],
): ScopeOfWork {
  const subtotal = items.reduce((sum, i) => sum + i.fee, 0);
  const blockers = scopeBlockers(header, items);
  return {
    id: null,
    projectId: '',
    status: ScopeOfWorkStatus.Draft,
    durationDays: header.durationDays,
    plannedStartDate: header.plannedStartDate,
    estimatedEndDate:
      header.plannedStartDate && header.durationDays
        ? addDays(header.plannedStartDate, header.durationDays)
        : null,
    subtotal,
    adjustmentAmount: header.adjustmentAmount,
    adjustmentNote: header.adjustmentNote,
    total: subtotal + header.adjustmentAmount,
    notes: header.notes,
    confirmedAtUtc: null,
    confirmedById: null,
    items: items.map<ScopeOfWorkItem>((i, index) => ({
      id: i.sourceStageId,
      sourceStageId: i.sourceStageId,
      sourceTemplateName: i.sourceTemplateName,
      name: i.name,
      description: i.description,
      order: index + 1,
      fee: i.fee,
      createdStageId: null,
      sourceMissing: false,
    })),
    canConfirm: blockers.length === 0,
    blockingReason: blockers[0] ?? null,
  };
}

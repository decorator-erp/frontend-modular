import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ERROR_MESSAGES, ERROR_MESSAGES_AR, friendlyMessage } from './error-catalog';
import { friendly, hasCatalogMessage } from '../http/error-handler.service';
import { LocaleService } from '../i18n/locale.service';
import type { ParsedApiError } from '../types/api-error';

/**
 * 009b X-2: the codes added from CRM-API-CONTRACT §5.1/§5.3 (checked against
 * `Crm.Domain/Errors/Errors.cs`, `CrmAccessGuard.cs` and `ApprovalErrors.cs`), plus the §5.2
 * scope-of-work and projects codes the scope-of-work feature raises.
 */
const ADDED_CRM_CODES = [
  'crm.access.Unauthenticated',
  'crm.access.NoStanding',
  'crm.access.NotAnEmployee',
  'crm.access.NotAClient',
  'crm.portal.NotFound',
  'crm.portal.NotAClient',
  'crm.clients.NotFound',
  'crm.clients.AddressRequired',
  'crm.clients.ChildNotFound',
  'crm.clients.Inactive',
  'crm.clients.InvalidActiveFilter',
  'crm.clients.ConcurrentUpdate',
  'crm.client_children.InvalidGender',
  'crm.client_children.InvalidAge',
  'crm.contacts.ConcurrentPrimaryChange',
  'crm.contacts.NameRequired',
  'crm.leads.NameRequired',
  'crm.leads.OwnerNotFound',
  'crm.leads.ResidentialWithoutSector',
  'crm.leads.ConcurrentUpdate',
  'crm.leads.InvalidClientId',
  'crm.briefs.UnitDetailsRequired',
  'crm.briefs.HeadLockedPendingApproval',
  'crm.briefs.NotSendable',
  'crm.briefs.ConcurrentSend',
  'crm.briefs.TooManyVoidedRounds',
  'crm.briefs.ConcurrencyConflict',
  'crm.briefs.StageProjectMismatch',
  'crm.briefs.SpaceProjectMismatch',
  'crm.briefs.TaskProjectMismatch',
  'crm.briefs.TaskStageMismatch',
  'crm.briefs.MeetingProjectMismatch',
  'crm.briefs.AlreadySuperseded',
  'crm.briefs.ProjectNotFound',
  'crm.briefs.RoundNotFound',
  'crm.briefs.SupersedeSpaceMismatch',
  'crm.spaces.DuplicateName',
  'crm.spaces.InvalidData',
  'crm.spaces.UnknownSpaceType',
  'crm.catalog.ItemNotFound',
  'crm.catalog.CategoryNotFound',
  'crm.catalog.AttributeNotFound',
  'crm.catalog.InvalidData',
  'crm.catalog.SpaceTypeNotFound',
  'crm.catalog.MaxDepthExceeded',
  'crm.catalog.CyclicMove',
  'crm.catalog.DuplicateMapping',
  'crm.periods.AlreadyOpen',
  'crm.periods.ConcurrentUpdate',
  'crm.items.UnknownSpaceType',
  'crm.items.AlreadyPending',
  'crm.items.TooManyVoidedRounds',
  'crm.items.AlreadySuperseded',
  'crm.items.ConcurrentUpdate',
  'crm.items.ProjectMismatch',
  'crm.items.TaskProjectMismatch',
  'crm.items.MeetingProjectMismatch',
  'crm.items.BriefProjectMismatch',
  'crm.items.NoteProjectMismatch',
  'crm.meetings.SlotTooLong',
  'crm.meetings.ConcurrentUpdate',
  'crm.meetings.SlotExpired',
  'crm.notes.ProjectMismatch',
  'crm.artifacts.DocumentNotFound',
  'crm.projects.Inactive',
  'approvals.ApprovalIdInUse',
  'approvals.Unauthenticated',
];

const ADDED_PROJECTS_CODES = [
  'projects.NotFound',
  'projects.AccessDenied',
  'projects.scope.Confirmed',
  'projects.scope.Empty',
  'projects.scope.DurationRequired',
  'projects.scope.NegativeTotal',
  'projects.scope.AdjustmentNoteRequired',
  'projects.scope.ProjectHasStages',
  'projects.scope.SourceStageNotFound',
  'projects.scope.WorkflowNotSupported',
  'projects.scope.DuplicateItem',
  'projects.scope.InvalidOrder',
  'projects.scope.ConcurrentUpdate',
  'projects.scope.TooManyItems',
  'projects.scope.ItemNotFound',
  'projects.scope.NegativeFee',
  'stage_templates.NotFound',
  'teams.MissingHead',
];

const parsed = (code: string | null, generalMessage = 'raw detail'): ParsedApiError => ({
  status: 409,
  generalMessage,
  fieldErrors: {},
  code,
  raw: null,
});

describe('ERROR_MESSAGES / ERROR_MESSAGES_AR — contract §5 codes (009b X-2)', () => {
  it.each([...ADDED_CRM_CODES, ...ADDED_PROJECTS_CODES])('%s has EN and AR copy', (code) => {
    expect(ERROR_MESSAGES[code]?.trim()).toBeTruthy();
    expect(ERROR_MESSAGES_AR[code]?.trim()).toBeTruthy();
    expect(ERROR_MESSAGES_AR[code]).not.toBe(ERROR_MESSAGES[code]);
  });

  // FINDING-5-9: codes the CRM screens raise that X-2 left without Arabic.
  it.each([
    'crm.meetings.CancelReasonRequired',
    'crm.periods.InvalidCloseTime',
    'crm.items.ItemLocked',
    'crm.items.NotPending',
    'crm.items.OnlyLockedSuperseded',
    'crm.items.InvalidSource',
    'crm.meetings.NotFound',
  ])('%s has EN and AR copy (FINDING-5-9)', (code) => {
    expect(ERROR_MESSAGES[code]?.trim()).toBeTruthy();
    expect(ERROR_MESSAGES_AR[code]?.trim()).toBeTruthy();
    expect(ERROR_MESSAGES_AR[code]).not.toBe(ERROR_MESSAGES[code]);
  });

  it('every AR entry has an EN entry of record', () => {
    for (const code of Object.keys(ERROR_MESSAGES_AR)) {
      expect(ERROR_MESSAGES[code], code).toBeTruthy();
    }
  });

  it('friendlyMessage picks the locale, AR falling back to EN, then to the fallback', () => {
    expect(friendlyMessage('crm.periods.AlreadyOpen', 'f', 'ar')).toBe(
      ERROR_MESSAGES_AR['crm.periods.AlreadyOpen'],
    );
    expect(friendlyMessage('crm.periods.AlreadyOpen', 'f')).toBe(
      ERROR_MESSAGES['crm.periods.AlreadyOpen'],
    );
    expect(friendlyMessage('employees.NotFound', 'f', 'ar')).toBe(
      ERROR_MESSAGES['employees.NotFound'],
    );
    expect(friendlyMessage('no.such.Code', 'f', 'ar')).toBe('f');
  });
});

describe('friendly() follows the active locale (009b X-2)', () => {
  let locale: LocaleService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    locale = TestBed.inject(LocaleService);
  });

  afterEach(() => locale.locale.set('en'));

  it('returns the Arabic text under the Arabic locale', () => {
    locale.locale.set('ar');
    expect(friendly(parsed('crm.meetings.SlotExpired'))).toBe(
      ERROR_MESSAGES_AR['crm.meetings.SlotExpired'],
    );
  });

  it('returns the English text under the English locale', () => {
    locale.locale.set('en');
    expect(friendly(parsed('crm.meetings.SlotExpired'))).toBe(
      ERROR_MESSAGES['crm.meetings.SlotExpired'],
    );
  });

  it('keeps the backend message for an unknown code in either locale', () => {
    locale.locale.set('ar');
    expect(friendly(parsed('no.such.Code'))).toBe('raw detail');
  });

  // FINDING-5-13: a route-claim 403 carries no code; it still gets the catalog's localized text.
  it('maps an uncoded 403 to the localized permission message', () => {
    const forbidden: ParsedApiError = {
      status: 403,
      generalMessage: "You don't have permission to perform this action.",
      fieldErrors: {},
      code: null,
      raw: null,
    };
    locale.locale.set('ar');
    expect(friendly(forbidden)).toBe(ERROR_MESSAGES_AR['http.Forbidden']);
    locale.locale.set('en');
    expect(friendly(forbidden)).toBe(ERROR_MESSAGES['http.Forbidden']);
    expect(hasCatalogMessage(forbidden)).toBe(true);
    expect(hasCatalogMessage({ ...forbidden, status: 500 })).toBe(false);
  });
});

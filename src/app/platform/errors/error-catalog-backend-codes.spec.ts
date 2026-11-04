import { describe, expect, it } from 'vitest';
import { ERROR_MESSAGES, ERROR_MESSAGES_AR } from './error-catalog';

/**
 * crm-prod M7: every `crm.*`, `projects.scope.*` and `approvals.*` code the backend declares
 * (dms `src/Modules/…`, collected from the `Error.BadRequest/NotFound/Conflict/Forbidden/
 * Unauthorized(...)` factories in SharedKernel `Error.cs`), each with its declaration site.
 * `crm.portal.InvalidDecision`, `crm.portal.InvalidStatus` and `approvals.CommentTooLong` arrive
 * with the B1 portal-approvals backend row. A code added on the backend gets a row here and an
 * entry in BOTH catalogs.
 */
const BACKEND_CODES = [
  'approvals.AlreadyDecided', // Approvals/Approvals.Domain/Errors/ApprovalErrors.cs:11
  'approvals.ApprovalIdInUse', // Approvals/Approvals.Domain/Errors/ApprovalErrors.cs:26
  'approvals.CommentRequired', // Approvals/Approvals.Domain/Errors/ApprovalErrors.cs:14
  'approvals.CommentTooLong', // Approvals/Approvals.Domain/Errors/ApprovalErrors.cs:20
  'approvals.InvalidSubject', // Approvals/Approvals.Domain/Errors/ApprovalErrors.cs:32
  'approvals.NotAssignedApprover', // Approvals/Approvals.Domain/Errors/ApprovalErrors.cs:29
  'approvals.NotFound', // Approvals/Approvals.Domain/Errors/ApprovalErrors.cs:16
  'approvals.OpenApprovalExists', // Approvals/Approvals.Domain/Errors/ApprovalErrors.cs:23
  'approvals.Unauthenticated', // Approvals/Approvals.Domain/Errors/ApprovalErrors.cs:38
  'crm.access.NoStanding', // Crm/Crm.Infrastructure/Services/CrmAccessGuard.cs:117
  'crm.access.NotAClient', // Crm/Crm.Infrastructure/Services/CrmAccessGuard.cs:133
  'crm.access.NotAnEmployee', // Crm/Crm.Infrastructure/Services/CrmAccessGuard.cs:127
  'crm.access.Unauthenticated', // Crm/Crm.Infrastructure/Services/CrmAccessGuard.cs:114
  'crm.artifacts.DocumentNotFound', // Crm/Crm.Domain/Errors/Errors.cs:331
  'crm.artifacts.InvalidAuthor', // Crm/Crm.Domain/Errors/Errors.cs:326
  'crm.artifacts.InvalidSubject', // Crm/Crm.Domain/Errors/Errors.cs:322
  'crm.briefs.AlreadyExists', // Crm/Crm.Domain/Errors/Errors.cs:158
  'crm.briefs.AlreadySuperseded', // Crm/Crm.Domain/Errors/Errors.cs:150
  'crm.briefs.ConcurrencyConflict', // Crm/Crm.Domain/Errors/Errors.cs:132
  'crm.briefs.ConcurrentSend', // Crm/Crm.Domain/Errors/Errors.cs:124
  'crm.briefs.EntryLocked', // Crm/Crm.Domain/Errors/Errors.cs:109
  'crm.briefs.EntryPending', // Crm/Crm.Domain/Errors/Errors.cs:112
  'crm.briefs.HeadLockedPendingApproval', // Crm/Crm.Domain/Errors/Errors.cs:115
  'crm.briefs.MeetingProjectMismatch', // Crm/Crm.Domain/Errors/Errors.cs:147
  'crm.briefs.NotDraft', // Crm/Crm.Domain/Errors/Errors.cs:96
  'crm.briefs.NotFound', // Crm/Crm.Domain/Errors/Errors.cs:93
  'crm.briefs.NotPending', // Crm/Crm.Domain/Errors/Errors.cs:103
  'crm.briefs.NotSendable', // Crm/Crm.Domain/Errors/Errors.cs:119
  'crm.briefs.OnlyLockedSuperseded', // Crm/Crm.Domain/Errors/Errors.cs:106
  'crm.briefs.ProjectNotFound', // Crm/Crm.Domain/Errors/Errors.cs:153
  'crm.briefs.RoundNotFound', // Crm/Crm.Domain/Errors/Errors.cs:161
  'crm.briefs.SpaceProjectMismatch', // Crm/Crm.Domain/Errors/Errors.cs:138
  'crm.briefs.StageProjectMismatch', // Crm/Crm.Domain/Errors/Errors.cs:135
  'crm.briefs.SupersedeSpaceMismatch', // Crm/Crm.Domain/Errors/Errors.cs:164
  'crm.briefs.TaskProjectMismatch', // Crm/Crm.Domain/Errors/Errors.cs:141
  'crm.briefs.TaskStageMismatch', // Crm/Crm.Domain/Errors/Errors.cs:144
  'crm.briefs.TooManyVoidedRounds', // Crm/Crm.Domain/Errors/Errors.cs:129
  'crm.briefs.UnitDetailsRequired', // Crm/Crm.Domain/Errors/Errors.cs:99
  'crm.catalog.AttributeNotFound', // Crm/Crm.Domain/Errors/Errors.cs:210
  'crm.catalog.AttributeTypeMismatch', // Crm/Crm.Domain/Errors/Errors.cs:219
  'crm.catalog.CategoryNotFound', // Crm/Crm.Domain/Errors/Errors.cs:207
  'crm.catalog.CustomNameRequired', // Crm/Crm.Domain/Errors/Errors.cs:213
  'crm.catalog.CyclicMove', // Crm/Crm.Domain/Errors/Errors.cs:232
  'crm.catalog.DuplicateMapping', // Crm/Crm.Domain/Errors/Errors.cs:235
  'crm.catalog.InvalidData', // Crm/Crm.Domain/Errors/Errors.cs:223
  'crm.catalog.ItemNotFound', // Crm/Crm.Domain/Errors/Errors.cs:204
  'crm.catalog.MaxDepthExceeded', // Crm/Crm.Domain/Errors/Errors.cs:229
  'crm.catalog.NotACustomEntry', // Crm/Crm.Domain/Errors/Errors.cs:216
  'crm.catalog.SpaceTypeNotFound', // Crm/Crm.Domain/Errors/Errors.cs:226
  'crm.client_children.InvalidAge', // Crm/Crm.Domain/Errors/Errors.cs:37
  'crm.client_children.InvalidGender', // Crm/Crm.Domain/Errors/Errors.cs:34
  'crm.clients.AddressRequired', // Crm/Crm.Domain/Errors/Errors.cs:17
  'crm.clients.AppUserIdRequired', // Crm/Crm.Domain/Errors/Errors.cs:14
  'crm.clients.ChildNotFound', // Crm/Crm.Domain/Errors/Errors.cs:20
  'crm.clients.ConcurrentUpdate', // Crm/Crm.Domain/Errors/Errors.cs:28
  'crm.clients.Inactive', // Crm/Crm.Domain/Errors/Errors.cs:24
  'crm.clients.InvalidActiveFilter', // Crm/Crm.Domain/Errors/Errors.cs:11
  'crm.clients.NotFound', // Crm/Crm.Domain/Errors/Errors.cs:7
  'crm.contacts.ConcurrentPrimaryChange', // Crm/Crm.Domain/Errors/Errors.cs:46
  'crm.contacts.NameRequired', // Crm/Crm.Domain/Errors/Errors.cs:49
  'crm.contacts.NotFound', // Crm/Crm.Domain/Errors/Errors.cs:42
  'crm.gates.UnsupportedOwner', // Crm/Crm.Domain/Errors/Errors.cs:354
  'crm.items.AlreadyPending', // Crm/Crm.Domain/Errors/Errors.cs:287
  'crm.items.AlreadySuperseded', // Crm/Crm.Domain/Errors/Errors.cs:297
  'crm.items.BriefProjectMismatch', // Crm/Crm.Domain/Errors/Errors.cs:313
  'crm.items.ConcurrentUpdate', // Crm/Crm.Domain/Errors/Errors.cs:301
  'crm.items.InvalidSource', // Crm/Crm.Domain/Errors/Errors.cs:263
  'crm.items.ItemLocked', // Crm/Crm.Domain/Errors/Errors.cs:266
  'crm.items.MeetingProjectMismatch', // Crm/Crm.Domain/Errors/Errors.cs:310
  'crm.items.NotFound', // Crm/Crm.Domain/Errors/Errors.cs:260
  'crm.items.NotPending', // Crm/Crm.Domain/Errors/Errors.cs:269
  'crm.items.NoteProjectMismatch', // Crm/Crm.Domain/Errors/Errors.cs:316
  'crm.items.OnlyLockedSuperseded', // Crm/Crm.Domain/Errors/Errors.cs:272
  'crm.items.ProjectMismatch', // Crm/Crm.Domain/Errors/Errors.cs:304
  'crm.items.SendRequiresEmployeeAuthor', // Crm/Crm.Domain/Errors/Errors.cs:275
  'crm.items.TaskProjectMismatch', // Crm/Crm.Domain/Errors/Errors.cs:307
  'crm.items.TooManyVoidedRounds', // Crm/Crm.Domain/Errors/Errors.cs:292
  'crm.items.UnknownSpaceType', // Crm/Crm.Domain/Errors/Errors.cs:281
  'crm.leads.AlreadyConverted', // Crm/Crm.Domain/Errors/Errors.cs:60
  'crm.leads.ConcurrentUpdate', // Crm/Crm.Domain/Errors/Errors.cs:81
  'crm.leads.DesignerExperienceWithoutUse', // Crm/Crm.Domain/Errors/Errors.cs:73
  'crm.leads.ExperienceReasonWithoutExperience', // Crm/Crm.Domain/Errors/Errors.cs:77
  'crm.leads.InvalidClientId', // Crm/Crm.Domain/Errors/Errors.cs:70
  'crm.leads.InvalidStatusTransition', // Crm/Crm.Domain/Errors/Errors.cs:63
  'crm.leads.NameRequired', // Crm/Crm.Domain/Errors/Errors.cs:57
  'crm.leads.NotFound', // Crm/Crm.Domain/Errors/Errors.cs:54
  'crm.leads.OwnerNotFound', // Crm/Crm.Domain/Errors/Errors.cs:84
  'crm.leads.ResidentialWithoutSector', // Crm/Crm.Domain/Errors/Errors.cs:87
  'crm.meetings.AlreadyStarted', // Crm/Crm.Domain/Errors/Errors.cs:378
  'crm.meetings.CancelReasonRequired', // Crm/Crm.Domain/Errors/Errors.cs:381
  'crm.meetings.ConcurrentUpdate', // Crm/Crm.Domain/Errors/Errors.cs:385
  'crm.meetings.InvalidProposer', // Crm/Crm.Domain/Errors/Errors.cs:365
  'crm.meetings.InvalidRequester', // Crm/Crm.Domain/Errors/Errors.cs:362
  'crm.meetings.InvalidSlotRange', // Crm/Crm.Domain/Errors/Errors.cs:368
  'crm.meetings.InvalidStateTransition', // Crm/Crm.Domain/Errors/Errors.cs:375
  'crm.meetings.NoSlotsProvided', // Crm/Crm.Domain/Errors/Errors.cs:409
  'crm.meetings.NotCounterparty', // Crm/Crm.Domain/Errors/Errors.cs:403
  'crm.meetings.NotFound', // Crm/Crm.Domain/Errors/Errors.cs:359
  'crm.meetings.SlotExpired', // Crm/Crm.Domain/Errors/Errors.cs:389
  'crm.meetings.SlotNotFound', // Crm/Crm.Domain/Errors/Errors.cs:397
  'crm.meetings.SlotNotProposed', // Crm/Crm.Domain/Errors/Errors.cs:392
  'crm.meetings.SlotTooLong', // Crm/Crm.Domain/Errors/Errors.cs:372
  'crm.notes.NotAuthor', // Crm/Crm.Domain/Errors/Errors.cs:340
  'crm.notes.NotFound', // Crm/Crm.Domain/Errors/Errors.cs:336
  'crm.notes.ProjectMismatch', // Crm/Crm.Domain/Errors/Errors.cs:344
  'crm.periods.AlreadyOpen', // Crm/Crm.Domain/Errors/Errors.cs:247
  'crm.periods.ConcurrentUpdate', // Crm/Crm.Domain/Errors/Errors.cs:251
  'crm.periods.InvalidCloseTime', // Crm/Crm.Domain/Errors/Errors.cs:254
  'crm.periods.NotFound', // Crm/Crm.Domain/Errors/Errors.cs:240
  'crm.periods.NotOpen', // Crm/Crm.Domain/Errors/Errors.cs:243
  'crm.portal.InvalidDecision', // Crm/Crm.Domain/Errors/Errors.cs:426
  'crm.portal.InvalidStatus', // Crm/Crm.Domain/Errors/Errors.cs:430
  'crm.portal.NotAClient', // Crm/Crm.Domain/Errors/Errors.cs:422
  'crm.portal.NotFound', // Crm/Crm.Domain/Errors/Errors.cs:419
  'crm.projects.Inactive', // Crm/Crm.Domain/Errors/Errors.cs:438
  'crm.space_types.CodeRequired', // Crm/Crm.Domain/Errors/Errors.cs:187
  'crm.space_types.DuplicateCode', // Crm/Crm.Domain/Errors/Errors.cs:194
  'crm.space_types.NameRequired', // Crm/Crm.Domain/Errors/Errors.cs:197
  'crm.space_types.NotFound', // Crm/Crm.Domain/Errors/Errors.cs:190
  'crm.spaces.DuplicateName', // Crm/Crm.Domain/Errors/Errors.cs:182
  'crm.spaces.InvalidData', // Crm/Crm.Domain/Errors/Errors.cs:174
  'crm.spaces.ItemNotFound', // Crm/Crm.Domain/Errors/Errors.cs:172
  'crm.spaces.SpaceNotFound', // Crm/Crm.Domain/Errors/Errors.cs:169
  'crm.spaces.UnknownSpaceType', // Crm/Crm.Domain/Errors/Errors.cs:178
  'projects.scope.AdjustmentNoteRequired', // Projects/Projects.Domain/Errors/Errors.cs:170
  'projects.scope.ConcurrentUpdate', // Projects/Projects.Domain/Errors/Errors.cs:194
  'projects.scope.Confirmed', // Projects/Projects.Domain/Errors/Errors.cs:158
  'projects.scope.DuplicateItem', // Projects/Projects.Domain/Errors/Errors.cs:188
  'projects.scope.DurationRequired', // Projects/Projects.Domain/Errors/Errors.cs:164
  'projects.scope.Empty', // Projects/Projects.Domain/Errors/Errors.cs:161
  'projects.scope.InvalidOrder', // Projects/Projects.Domain/Errors/Errors.cs:191
  'projects.scope.ItemNotFound', // Projects/Projects.Domain/Errors/Errors.cs:200
  'projects.scope.NegativeFee', // Projects/Projects.Domain/Errors/Errors.cs:203
  'projects.scope.NegativeTotal', // Projects/Projects.Domain/Errors/Errors.cs:167
  'projects.scope.ProjectHasStages', // Projects/Projects.Domain/Errors/Errors.cs:173
  'projects.scope.SourceStageNotFound', // Projects/Projects.Domain/Errors/Errors.cs:176
  'projects.scope.TooManyItems', // Projects/Projects.Domain/Errors/Errors.cs:197
  'projects.scope.WorkflowNotSupported', // Projects/Projects.Domain/Errors/Errors.cs:185
] as const;

describe('error catalog — backend CRM, scope and approvals codes (crm-prod M7)', () => {
  it('lists each code once', () => {
    expect(new Set(BACKEND_CODES).size).toBe(BACKEND_CODES.length);
  });

  it.each(BACKEND_CODES)('%s has an English message', (code) => {
    expect(ERROR_MESSAGES[code]?.trim()).toBeTruthy();
  });

  it.each(BACKEND_CODES)('%s has an Arabic message that is not the English one', (code) => {
    const ar = ERROR_MESSAGES_AR[code]?.trim();
    expect(ar).toBeTruthy();
    expect(ar).not.toBe(ERROR_MESSAGES[code]);
  });
});

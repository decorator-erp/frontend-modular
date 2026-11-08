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
  'crm.artifacts.AlreadyLinked', // Crm/Crm.Domain/Errors/Errors.cs:335
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
  'crm.gates.UnsupportedOwner', // Crm/Crm.Domain/Errors/Errors.cs:358
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
  'crm.meetings.AlreadyStarted', // Crm/Crm.Domain/Errors/Errors.cs:382
  'crm.meetings.CancelReasonRequired', // Crm/Crm.Domain/Errors/Errors.cs:385
  'crm.meetings.ConcurrentUpdate', // Crm/Crm.Domain/Errors/Errors.cs:389
  'crm.meetings.InvalidProposer', // Crm/Crm.Domain/Errors/Errors.cs:369
  'crm.meetings.InvalidRequester', // Crm/Crm.Domain/Errors/Errors.cs:366
  'crm.meetings.InvalidSlotRange', // Crm/Crm.Domain/Errors/Errors.cs:372
  'crm.meetings.InvalidStateTransition', // Crm/Crm.Domain/Errors/Errors.cs:379
  'crm.meetings.NoSlotsProvided', // Crm/Crm.Domain/Errors/Errors.cs:413
  'crm.meetings.NotCounterparty', // Crm/Crm.Domain/Errors/Errors.cs:407
  'crm.meetings.NotFound', // Crm/Crm.Domain/Errors/Errors.cs:363
  'crm.meetings.SlotExpired', // Crm/Crm.Domain/Errors/Errors.cs:393
  'crm.meetings.SlotNotFound', // Crm/Crm.Domain/Errors/Errors.cs:401
  'crm.meetings.SlotNotProposed', // Crm/Crm.Domain/Errors/Errors.cs:396
  'crm.meetings.SlotTooLong', // Crm/Crm.Domain/Errors/Errors.cs:376
  'crm.notes.NotAuthor', // Crm/Crm.Domain/Errors/Errors.cs:344
  'crm.notes.NotFound', // Crm/Crm.Domain/Errors/Errors.cs:340
  'crm.notes.ProjectMismatch', // Crm/Crm.Domain/Errors/Errors.cs:348
  'crm.periods.AlreadyOpen', // Crm/Crm.Domain/Errors/Errors.cs:247
  'crm.periods.ConcurrentUpdate', // Crm/Crm.Domain/Errors/Errors.cs:251
  'crm.periods.InvalidCloseTime', // Crm/Crm.Domain/Errors/Errors.cs:254
  'crm.periods.NotFound', // Crm/Crm.Domain/Errors/Errors.cs:240
  'crm.periods.NotOpen', // Crm/Crm.Domain/Errors/Errors.cs:243
  'crm.portal.InvalidDecision', // Crm/Crm.Domain/Errors/Errors.cs:430
  'crm.portal.InvalidStatus', // Crm/Crm.Domain/Errors/Errors.cs:434
  'crm.portal.NotAClient', // Crm/Crm.Domain/Errors/Errors.cs:426
  'crm.portal.NotFound', // Crm/Crm.Domain/Errors/Errors.cs:423
  // crmp P2-B: the portal visibility codes (dms branch local/portal-wip, Crm/Crm.Domain/Errors/Errors.cs).
  'crm.portal.AlreadyPublished', // Crm/Crm.Domain/Errors/Errors.cs:537
  'crm.portal.AlreadyShared', // Crm/Crm.Domain/Errors/Errors.cs:518
  'crm.portal.BodyTooLong', // Crm/Crm.Domain/Errors/Errors.cs:527
  'crm.portal.InvalidAttachment', // Crm/Crm.Domain/Errors/Errors.cs:545
  'crm.portal.InvalidItem', // Crm/Crm.Domain/Errors/Errors.cs:509
  'crm.portal.InvalidOrder', // Crm/Crm.Domain/Errors/Errors.cs:541
  'crm.portal.ItemNotFound', // Crm/Crm.Domain/Errors/Errors.cs:507
  'crm.portal.NotAPhoto', // Crm/Crm.Domain/Errors/Errors.cs:515
  'crm.portal.NotAnImage', // Crm/Crm.Domain/Errors/Errors.cs:512
  'crm.portal.NoteTooLong', // Crm/Crm.Domain/Errors/Errors.cs:524
  'crm.portal.SettingsChanged', // Crm/Crm.Domain/Errors/Errors.cs:534
  'crm.portal.ShareNotFound', // Crm/Crm.Domain/Errors/Errors.cs:501
  'crm.portal.TitleTooLong', // Crm/Crm.Domain/Errors/Errors.cs:521
  'crm.portal.UpdateNotFound', // Crm/Crm.Domain/Errors/Errors.cs:503
  // crmp P1-B: a grantee below Editor writing CRM (CrmProjectAccessErrors).
  'crm.project.InsufficientLevel', // Crm/Crm.Domain/Errors/Errors.cs:503
  'crm.portal.UpdateTitleRequired', // Crm/Crm.Domain/Errors/Errors.cs:530
  'crm.projects.Inactive', // Crm/Crm.Domain/Errors/Errors.cs:442
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

/**
 * crmp A-1: the Projects (contract §5.5/§5.6), crm-complete CRM, gate, stage-template and Sites codes
 * the catalog was missing, copied from dms `master` (`20cf251`), each with its declaration site
 * (paths under `src/Modules/`). Sites codes are `$"{Prefix}.{nameof(X)}"` with Prefix `sites`.
 */
const CRMP_CODES = [
  'crm.artifacts.LinkNotFound', // Crm/Crm.Domain/Errors/Errors.cs:362
  'crm.artifacts.NotLinker', // Crm/Crm.Domain/Errors/Errors.cs:366
  'crm.catalog.CodeTaken', // Crm/Crm.Domain/Errors/Errors.cs:239
  'crm.catalog.EntryNotFound', // Crm/Crm.Domain/Errors/Errors.cs:236
  'crm.catalog.InUse', // Crm/Crm.Domain/Errors/Errors.cs:234
  'crm.catalog.MappingNotFound', // Crm/Crm.Domain/Errors/Errors.cs:242
  'crm.mywork.NotAnEmployee', // Crm/Crm.Domain/Errors/Errors.cs:470
  'crm.spaces.InUse', // Crm/Crm.Domain/Errors/Errors.cs:172
  'crm.spaces.InvalidOrder', // Crm/Crm.Domain/Errors/Errors.cs:176
  'crm.storefront.CategoryNotTargeted', // Crm/Crm.Domain/Errors/Errors.cs:218
  'crm.storefront.ConcurrentUpdate', // Crm/Crm.Domain/Errors/Errors.cs:227
  'crm.storefront.InvalidOrder', // Crm/Crm.Domain/Errors/Errors.cs:224
  'crm.storefront.ItemNotAvailable', // Crm/Crm.Domain/Errors/Errors.cs:215
  'crm.storefront.OptionNotOfAttribute', // Crm/Crm.Domain/Errors/Errors.cs:221
  'crm.storefront.SelectionNotFound', // Crm/Crm.Domain/Errors/Errors.cs:212
  'gate_conditions.CrossProjectReference', // Projects/Projects.Domain/Errors/Errors.cs:258
  'gate_conditions.InvalidReference', // Projects/Projects.Domain/Errors/Errors.cs:249
  'gate_conditions.InvalidScope', // Projects/Projects.Domain/Errors/Errors.cs:246
  'gate_conditions.NotDeletable', // Projects/Projects.Domain/Errors/Errors.cs:295
  'gate_conditions.NotFound', // Projects/Projects.Domain/Errors/Errors.cs:243
  'gate_conditions.NotManuallySatisfiable', // Projects/Projects.Domain/Errors/Errors.cs:284
  'gate_conditions.OwnerNotOpen', // Projects/Projects.Domain/Errors/Errors.cs:290
  'gate_conditions.ReferenceNotFound', // Projects/Projects.Domain/Errors/Errors.cs:255
  'gate_conditions.SelfReference', // Projects/Projects.Domain/Errors/Errors.cs:252
  'gate_conditions.UnsupportedConditionType', // Projects/Projects.Domain/Errors/Errors.cs:277
  'projects.Closed', // Projects/Projects.Domain/Errors/Errors.cs:43
  'projects.CodeTaken', // Projects/Projects.Domain/Errors/Errors.cs:34
  'projects.ConcurrentUpdate', // Projects/Projects.Domain/Errors/Errors.cs:38
  'projects.InsufficientLevel', // Projects/Projects.Domain/Errors/Errors.cs:21
  'projects.InvalidStatusTransition', // Projects/Projects.Domain/Errors/Errors.cs:10
  'projects.NotDeletable', // Projects/Projects.Domain/Errors/Errors.cs:57
  'projects.StagesOpen', // Projects/Projects.Domain/Errors/Errors.cs:47
  'projects.TasksOpen', // Projects/Projects.Domain/Errors/Errors.cs:52
  // crmp P1-B: project access grants (ProjectAccessGrantErrors).
  'projects.access_grants.AboveOwnLevel', // Projects/Projects.Domain/Errors/Errors.cs:367
  'projects.access_grants.AlreadyGranted', // Projects/Projects.Domain/Errors/Errors.cs:388
  'projects.access_grants.AlreadyMember', // Projects/Projects.Domain/Errors/Errors.cs:384
  'projects.access_grants.AlreadyRevoked', // Projects/Projects.Domain/Errors/Errors.cs:394
  'projects.access_grants.ConcurrentUpdate', // Projects/Projects.Domain/Errors/Errors.cs:397
  'projects.access_grants.EmployeeNotFound', // Projects/Projects.Domain/Errors/Errors.cs:359
  'projects.access_grants.InvalidWindow', // Projects/Projects.Domain/Errors/Errors.cs:376
  'projects.access_grants.NoAreas', // Projects/Projects.Domain/Errors/Errors.cs:379
  'projects.access_grants.NotAllowed', // Projects/Projects.Domain/Errors/Errors.cs:363
  'projects.access_grants.NotEditable', // Projects/Projects.Domain/Errors/Errors.cs:391
  'projects.access_grants.NotFound', // Projects/Projects.Domain/Errors/Errors.cs:356
  'projects.access_grants.SelfGrant', // Projects/Projects.Domain/Errors/Errors.cs:370
  'projects.access_grants.StageNotInProject', // Projects/Projects.Domain/Errors/Errors.cs:373
  'projects.comments.NotAuthor', // Projects/Projects.Domain/Errors/Errors.cs:184
  'projects.comments.NotFound', // Projects/Projects.Domain/Errors/Errors.cs:181
  'projects.members.AlreadyMember', // Projects/Projects.Domain/Errors/Errors.cs:150
  'projects.members.ConcurrentUpdate', // Projects/Projects.Domain/Errors/Errors.cs:153
  'projects.members.EmployeeNotFound', // Projects/Projects.Domain/Errors/Errors.cs:147
  'projects.members.NotFound', // Projects/Projects.Domain/Errors/Errors.cs:144
  'projects.stages.NotDeletable', // Projects/Projects.Domain/Errors/Errors.cs:92
  'projects.stages.ScopeNotConfirmed', // Projects/Projects.Domain/Errors/Errors.cs:83
  'projects.stages.WorkflowNotSupported', // Projects/Projects.Domain/Errors/Errors.cs:87
  'projects.subtasks.NotAssignee', // Projects/Projects.Domain/Errors/Errors.cs:175
  'projects.subtasks.NotDeletable', // Projects/Projects.Domain/Errors/Errors.cs:167
  'projects.subtasks.NotDone', // Projects/Projects.Domain/Errors/Errors.cs:163
  'projects.subtasks.TaskClosed', // Projects/Projects.Domain/Errors/Errors.cs:171
  'projects.tasks.AssigneeNotFound', // Projects/Projects.Domain/Errors/Errors.cs:128
  'projects.tasks.NotAssignee', // Projects/Projects.Domain/Errors/Errors.cs:133
  'projects.tasks.NotDeletable', // Projects/Projects.Domain/Errors/Errors.cs:116
  'projects.tasks.StageClosed', // Projects/Projects.Domain/Errors/Errors.cs:120
  'projects.tasks.StageCompleted', // Projects/Projects.Domain/Errors/Errors.cs:125
  'projects.teams.AlreadyExists', // Projects/Projects.Domain/Errors/Errors.cs:198
  'projects.teams.HeadNotFound', // Projects/Projects.Domain/Errors/Errors.cs:201
  'projects.teams.HeadOrDepartmentRequired', // Projects/Projects.Application/Features/Teams/ProjectTeamHandlers.cs:20
  'sites.AddressRequiredToSubmit', // Sites/Sites.Domain/Errors/SiteErrors.cs:171
  'sites.AlreadyLinked', // Sites/Sites.Domain/Errors/SiteErrors.cs:43
  'sites.CatalogItemNotFound', // Sites/Sites.Domain/Errors/SiteErrors.cs:145
  'sites.CodeTaken', // Sites/Sites.Domain/Errors/SiteErrors.cs:40
  'sites.ConcurrencyConflict', // Sites/Sites.Domain/Errors/SiteErrors.cs:51
  'sites.DocumentAlreadyLinked', // Sites/Sites.Domain/Errors/SiteErrors.cs:188
  'sites.DocumentNotFound', // Sites/Sites.Domain/Errors/SiteErrors.cs:181
  'sites.InsufficientLevel', // Sites/Sites.Domain/Errors/SiteErrors.cs:103
  'sites.InvalidData', // Sites/Sites.Domain/Errors/SiteErrors.cs:37
  'sites.InvalidDocumentSubject', // Sites/Sites.Domain/Errors/SiteErrors.cs:191
  'sites.InvalidTransition', // Sites/Sites.Domain/Errors/SiteErrors.cs:148
  'sites.ItemInUse', // Sites/Sites.Domain/Errors/SiteErrors.cs:64
  'sites.ItemLocked', // Sites/Sites.Domain/Errors/SiteErrors.cs:60
  'sites.ItemNotFound', // Sites/Sites.Domain/Errors/SiteErrors.cs:28
  'sites.LabelTaken', // Sites/Sites.Domain/Errors/SiteErrors.cs:126
  'sites.LimitNotLegalForType', // Sites/Sites.Domain/Errors/SiteErrors.cs:81
  'sites.LinkNotFound', // Sites/Sites.Domain/Errors/SiteErrors.cs:34
  'sites.ModuleInUse', // Sites/Sites.Domain/Errors/SiteErrors.cs:67
  'sites.ModuleNotFound', // Sites/Sites.Domain/Errors/SiteErrors.cs:25
  'sites.NotFound', // Sites/Sites.Domain/Errors/SiteErrors.cs:98
  'sites.OptionNotFound', // Sites/Sites.Domain/Errors/SiteErrors.cs:31
  'sites.OptionNotOfItem', // Sites/Sites.Domain/Errors/SiteErrors.cs:178
  'sites.OptionsRequireSelect', // Sites/Sites.Domain/Errors/SiteErrors.cs:84
  'sites.ProjectClosed', // Sites/Sites.Domain/Errors/SiteErrors.cs:122
  'sites.ProjectNotFound', // Sites/Sites.Domain/Errors/SiteErrors.cs:115
  'sites.RecordNotFound', // Sites/Sites.Domain/Errors/SiteErrors.cs:106
  'sites.SelfApprovalNotAllowed', // Sites/Sites.Domain/Errors/SiteErrors.cs:167
  'sites.SiteLocked', // Sites/Sites.Domain/Errors/SiteErrors.cs:157
  'sites.SpaceNotFound', // Sites/Sites.Domain/Errors/SiteErrors.cs:138
  'sites.SpaceNotInProject', // Sites/Sites.Domain/Errors/SiteErrors.cs:135
  'sites.SystemDefinitionNotRenameable', // Sites/Sites.Domain/Errors/SiteErrors.cs:93
  'sites.SystemItemNotDeletable', // Sites/Sites.Domain/Errors/SiteErrors.cs:74
  'sites.SystemModuleNotDeletable', // Sites/Sites.Domain/Errors/SiteErrors.cs:71
  'sites.ValueTypeMismatch', // Sites/Sites.Domain/Errors/SiteErrors.cs:175
  'sites.families.NoDimensions', // Sites/Sites.Application/Features/Records/SiteRecordQueryHandlers.cs:303
  'sites.families.UnknownGroupBy', // Sites/Sites.Application/Features/Records/SiteRecordQueryHandlers.cs:316
  'stage_templates.InUse', // Projects/Projects.Domain/Errors/Errors.cs:220
  'stage_templates.NameTaken', // Projects/Projects.Domain/Errors/Errors.cs:224
  'stage_templates.StagesNotFound', // Projects/Projects.Domain/Errors/Errors.cs:215
  'stages.GatesNotSatisfied', // Projects/Projects.Domain/Errors/Errors.cs:78
  'stages.InvalidStatusTransition', // Projects/Projects.Domain/Errors/Errors.cs:65
  'stages.NegativeCost', // Projects/Projects.Domain/Errors/Errors.cs:67
  'stages.NotFound', // Projects/Projects.Domain/Errors/Errors.cs:62
  'stages.TasksOpen', // Projects/Projects.Domain/Errors/Errors.cs:71
  'stages.TemplateStageNotFound', // Projects/Projects.Domain/Errors/Errors.cs:233
  'subtasks.AlreadyDone', // Projects/Projects.Domain/Errors/Errors.cs:160
  'subtasks.NotFound', // Projects/Projects.Domain/Errors/Errors.cs:158
  'tasks.GatesNotSatisfied', // Projects/Projects.Domain/Errors/Errors.cs:138
  'tasks.InvalidStatusTransition', // Projects/Projects.Domain/Errors/Errors.cs:100
  'tasks.NegativeCost', // Projects/Projects.Domain/Errors/Errors.cs:111
  'tasks.NotFound', // Projects/Projects.Domain/Errors/Errors.cs:97
  'tasks.StageNotAllowed', // Projects/Projects.Domain/Errors/Errors.cs:106
  'tasks.StageRequired', // Projects/Projects.Domain/Errors/Errors.cs:103
  'tasks.SubTasksIncomplete', // Projects/Projects.Domain/Errors/Errors.cs:109
  'teams.MemberAlreadyExists', // Projects/Projects.Domain/Errors/Errors.cs:194
  'teams.MemberNotFound', // Projects/Projects.Domain/Errors/Errors.cs:191
  'teams.NotFound', // Projects/Projects.Domain/Errors/Errors.cs:189
] as const;

describe('error catalog — crmp Projects, CRM, gates, templates and Sites codes (crmp A-1)', () => {
  it('lists each code once', () => {
    expect(new Set(CRMP_CODES).size).toBe(CRMP_CODES.length);
  });

  it.each(CRMP_CODES)('%s has an English message', (code) => {
    expect(ERROR_MESSAGES[code]?.trim()).toBeTruthy();
  });

  it.each(CRMP_CODES)('%s has an Arabic message that is not the English one', (code) => {
    const ar = ERROR_MESSAGES_AR[code]?.trim();
    expect(ar).toBeTruthy();
    expect(ar).not.toBe(ERROR_MESSAGES[code]);
  });
});

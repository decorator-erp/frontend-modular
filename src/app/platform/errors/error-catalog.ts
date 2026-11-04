/**
 * Friendly-message catalog for every backend error code documented in
 * `api-docs/` (01-auth … 10-activities-audits). Codes arrive in the
 * ProblemDetails `errors` map and are surfaced by ErrorHandlerService as
 * `ParsedApiError.code`. Do not invent codes — add them only when they appear
 * in the backend docs.
 */
export const ERROR_MESSAGES: Record<string, string> = {
  // From api-docs/01-auth.md
  'authentications.InvalidCredentials': 'The email or password is incorrect.',
  'authentications.UnAuthorization': 'You are not authorized to do that.',
  'authentications.InvalidToken': 'Your session is invalid. Please sign in again.',
  'authentications.InvalidRefreshToken': 'Your session expired. Please sign in again.',
  'authentications.InvalidUser': 'Your session is invalid. Please sign in again.',
  'authentications.DuplicatedEmail': 'This email is already taken.',
  'authentications.InvalidRegister':
    'The account details are invalid. Please review and try again.',
  // Backend remediation v3 (002b A5, KNOWN-DELTA-3). `UserNotActive` was deleted there: a
  // deactivated account now answers `InvalidCredentials`.
  'authentications.StaleToken': 'Your session is no longer valid. Please sign in again.',
  'authentications.LockedOut': 'Too many attempts. Try again in 15 minutes.',
  'authentications.RefreshTokenReused': 'Your session has ended. Please sign in again.',
  'users.NotFound': 'User not found.',
  'users.DuplicatedEmail': 'This email is already registered.',

  // From api-docs/02-clients.md
  'clients.NotFound': 'Client not found.',
  'clients.AlreadyActive': 'This client is already active.',
  'clients.NotActive': 'This client is not active.',
  'clients.CreatedFailed': 'Could not create the client. Please try again.',
  'clients.UpdateFailed': 'Could not update the client. Please try again.',
  'clients.DeleteFailed': 'Could not delete the client.',
  'clients.ActivatedFailed': 'Could not activate the client. Please try again.',
  'clients.DeactivatedFailed': 'Could not deactivate the client. Please try again.',

  // From api-docs/03-employees.md
  'employees.NotFound': 'Employee not found.',
  'employees.AlreadyActive': 'This employee is already active.',
  'employees.AlreadyInactive': 'This employee is already inactive.',
  'employees.ActiveException': 'Could not activate the employee. Please try again.',
  'employees.InactiveException': 'Could not deactivate the employee. Please try again.',
  // Backend remediation v3 (006b-2 #28).
  'employees.Inactive': 'This employee is inactive. Reactivate them first.',
  'employees.AlreadyInAnotherDepartment':
    'This employee already belongs to another department. Move them instead.',
  'employees.EndDateBeforeHireDate': 'The end date can’t be before the hire date.',
  'employees.WeakPassword':
    'The password must have at least 8 characters, with a digit, a lowercase letter, an uppercase letter and a symbol.',

  // From api-docs/04-departments.md
  'departments.NotFound': 'Department not found.',
  'departments.DuplicatedName': 'A department with this name already exists.',
  'departments.AlreadyInDepartment': 'This employee is already in that department.',
  'departments.UserNotInDepartment': 'This employee is not in the selected department.',
  // Backend remediation v3 (006b-2 #28, KNOWN-DELTA-3). `NoEmployeesToMove` was deleted there.
  'departments.RemoveHeadFirst': 'This employee heads the department. Unassign them as head first.',

  // From api-docs/05-roles-permissions.md
  'roles.NotFound': 'Role not found.',
  'roles.DuplicatedRole': 'A role with this name already exists.',
  'permissions.InvalidPermission': 'That permission is not recognized by the system.',
  'permissions.PermissionOverrideAlreadyExists':
    'An override for this permission already exists for that user.',
  'permissions.PermissionOverrideNotFound': 'No override exists for this permission.',
  // Backend remediation v3 (006b-1 #5, KNOWN-DELTA-3). For `CannotDelegate` the screen shows the
  // server's description, which names the missing permissions; this is the fallback.
  'permissions.CannotDelegate': 'You can only give permissions you hold yourself.',
  'permissions.SelfModification':
    'You can’t change permissions on your own account. Ask another administrator.',
  'permissions.LastHolder': 'At least one active user must keep this permission.',
  'roles.SystemRole': 'This is a system role. It can’t be renamed or deleted.',
  'roles.FullAccessLocked':
    'This role always holds every permission. Its permissions can’t be edited.',
  'roles.RoleInUse': 'This role is still assigned. Remove its members first.',

  // From api-docs/06-projects.md
  'projects.NotFound': 'Project not found.',
  'projects.DuplicatedCode': 'A project with this code already exists.',
  'projects.StageWorkflowInvalid':
    'Stage-based projects need a stage template. Pick one to continue.',
  'projects.FreeStyleCannotHaveStageTemplate': 'Free-style projects cannot use a stage template.',
  'projects.WorkflowTypeCannotBeChanged': 'The workflow type cannot be changed after creation.',
  'projects.InvalidStatusTransition':
    'The project cannot move to that status from its current one.',
  'projects.CreateFailed': 'Could not create the project. Please try again.',
  'projects.UpdateFailed': 'Could not update the project. Please try again.',
  'projects.ActivateFailed': 'Could not activate the project. Please try again.',
  'projects.DeactivateFailed': 'Could not deactivate the project. Please try again.',
  'projects.DeleteFailed': 'Could not delete the project.',
  'projects.InvalidAccess': 'You do not have permission to perform this action on this project.',

  // From api-docs/07-project-stages-tasks.md — project stages
  'project_stages.NotFound': 'Stage not found.',
  'project_stages.NotAllowedInFreeStyle': 'Stages cannot be added to free-style projects.',
  'project_stages.DuplicateOrder': 'A stage with this order already exists in the project.',
  'project_stages.CreationFailed': 'Could not create the stage. Please try again.',
  'project_stages.UpdateFailed': 'Could not update the stage. Please try again.',
  'project_stages.DeleteFailed': 'Could not delete the stage.',
  'project_stages.RejectedTasksPending':
    'This stage has rejected tasks that must be reworked before it can be completed.',
  'project_stages.ApprovalGateNotFound': 'There is no pending approval of this type on this stage.',
  'project_stages.InvalidReject': 'Only active stages can be rejected.',
  'stages.CannotActivate':
    'This stage cannot start yet — the previous stage must be completed first.',
  'stages.StillHasPendingTasks': 'This stage still has pending tasks and cannot be completed.',
  'stages.GatesNotSatisfied': 'The stage gate conditions are not satisfied yet.',
  'stages.AlreadyCompleted': 'This stage is already completed.',

  // From api-docs/07-project-stages-tasks.md — project tasks
  'project_tasks.NotFound': 'Task not found.',
  'project_tasks.StageRequiredForStageWorkflow':
    'Tasks in a stage-based project must belong to a stage.',
  'project_tasks.StageNotAllowedInFreeStyle':
    'Tasks in a free-style project cannot belong to a stage.',
  'project_tasks.DuplicateOrder': 'A task with this order already exists.',
  'project_tasks.CreationFailed': 'Could not create the task. Please try again.',
  'project_tasks.UpdateFailed': 'Could not update the task. Please try again.',
  'project_tasks.DeleteFailed': 'Could not delete the task.',
  'project_tasks.TaskHasAPendingApproval':
    'This task already has a pending approval and is awaiting review.',
  'project_tasks.ApprovalGateNotFound': 'There is no pending approval of this type on this task.',
  'tasks.StillLocked': 'This task cannot start yet — its dependencies are not satisfied.',
  'tasks.CompletionBlocked':
    'This task cannot be completed yet — approvals or conditions are still pending.',
  'tasks.SubTasksIncomplete': 'Required subtasks are not done yet.',
  'tasks.MissingRequiredAttachments': 'Required attachments are missing on this task.',
  'tasks.InvalidStatusTransition': 'The task cannot move to that status from its current one.',
  'tasks.ApprovalNotAuthorized': 'You are not authorized to approve this task.',
  'tasks.DependencyCycle': 'This would create a circular dependency between tasks.',

  // From api-docs/07-project-stages-tasks.md — sub-tasks
  'project_sub_tasks.NotFound': 'Subtask not found.',
  'project_sub_tasks.CreationFailed': 'Could not create the subtask. Please try again.',
  'project_sub_tasks.UpdateFailed': 'Could not update the subtask. Please try again.',
  'project_sub_tasks.DeleteFailed': 'Could not delete the subtask.',
  'project_sub_tasks.AlreadyDone': 'This subtask is already done.',
  'project_sub_tasks.NotDone': 'This subtask is not done yet.',

  // From api-docs/08-stage-templates-teams-gates.md — stage templates
  'stage_templates.NotFound': 'Stage template not found.',
  'stage_templates.DuplicateName': 'A stage template with this name already exists.',
  'stage_templates.CannotModifySystemTemplate': 'System templates cannot be modified or deleted.',
  'stage_templates.CreationFailed': 'Could not create the stage template. Please try again.',
  'stage_templates.UpdateFailed': 'Could not update the stage template. Please try again.',
  'stage_templates.DeleteFailed': 'Could not delete the stage template.',

  // From api-docs/08-stage-templates-teams-gates.md — template stages
  'stages.NotFound': 'Template stage not found.',
  'stages.DuplicateOrder': 'A stage with this order already exists in the template.',
  'stages.CreationFailed': 'Could not create the stage. Please try again.',
  'stages.UpdateFailed': 'Could not update the stage. Please try again.',
  'stages.DeleteFailed': 'Could not delete the stage.',

  // From api-docs/08-stage-templates-teams-gates.md — stage teams
  'stage_teams.NotFound': 'Stage team not found.',
  'stage_teams.MemberNotFound': 'Team member not found.',
  'stage_teams.DuplicateDepartmentTeam': 'This department already has a team on this stage.',
  'stage_teams.DepartmentHasNoHead': 'The department has no head assigned to lead the team.',
  'stage_teams.AlreadyMember': 'This employee is already a member of the team.',
  'stage_teams.EmployeeNotInDepartment': "This employee does not belong to the team's department.",
  'stage_teams.CannotAddMemberToTemplateTeam': 'Members cannot be added to a template stage team.',
  'stage_teams.NotAuthorizedToManage': 'You are not allowed to manage this stage team.',
  'stage_teams.HeadRequired': 'A stage team must always have a head.',
  'stage_teams.AddFailed': 'Could not create the stage team. Please try again.',
  'stage_teams.AddMemberFailed': 'Could not add the team member. Please try again.',
  'stage_teams.UpdateFailed': 'Could not update the team member. Please try again.',
  'stage_teams.RemoveFailed': 'Could not remove the team member.',

  // From api-docs/08-stage-templates-teams-gates.md — gate conditions (shared)
  'gate_conditions.InvalidReference': 'The selected reference does not match the condition type.',
  'gate_conditions.ReferenceNotFound': 'The referenced task or stage was not found.',
  'gate_conditions.CrossProjectReference':
    'The referenced task or stage belongs to a different project.',
  'gate_conditions.SelfReference': 'A gate condition cannot reference its own task or stage.',
  'gate_conditions.UnsupportedType': 'This gate condition type is not supported.',
  'gate_conditions.UnsupportedOwner': 'This condition type is not supported here.',

  // From api-docs/08-stage-templates-teams-gates.md — stage gate conditions
  'stage_gate_conditions.NotFound': 'Gate condition not found.',
  'stage_gate_conditions.CreationFailed': 'Could not create the gate condition. Please try again.',
  'stage_gate_conditions.UpdateFailed': 'Could not update the gate condition. Please try again.',
  'stage_gate_conditions.DeleteFailed': 'Could not delete the gate condition.',
  'stage_gate_conditions.AlreadySatisfied': 'This gate condition is already satisfied.',
  'stage_gate_conditions.AlreadyRejected': 'This gate condition was already rejected.',
  'stage_gate_conditions.AttachmentRequired':
    'An attachment must be uploaded to a task in this stage before this gate can be satisfied.',

  // From api-docs/08-stage-templates-teams-gates.md — task gate conditions
  'task_gate_conditions.NotFound': 'Gate condition not found.',
  'task_gate_conditions.CreationFailed': 'Could not create the gate condition. Please try again.',
  'task_gate_conditions.UpdateFailed': 'Could not update the gate condition. Please try again.',
  'task_gate_conditions.DeleteFailed': 'Could not delete the gate condition.',
  'task_gate_conditions.AlreadySatisfied': 'This gate condition is already satisfied.',
  'task_gate_conditions.AlreadyRejected': 'This gate condition was already rejected.',
  'task_gate_conditions.AttachmentRequired':
    'An attachment must be uploaded to the task before this gate can be satisfied.',
  'task_gate_conditions.InvalidRejectProcess': 'Only approval conditions can be rejected.',

  // From api-docs/09-documents-attachments-comments.md — document folders
  'document_folders.NotFound': 'Folder not found.',
  'document_folders.ProjectNotFound': 'The project for this folder was not found.',
  'document_folders.DuplicateName': 'A folder with this name already exists here.',
  'document_folders.NotEmpty': 'The folder is not empty. Move or delete its contents first.',
  'document_folders.CreateFailed': 'Could not create the folder. Please try again.',
  'document_folders.UpdateFailed': 'Could not update the folder. Please try again.',
  'document_folders.DeleteFailed': 'Could not delete the folder.',

  // From api-docs/09-documents-attachments-comments.md — project documents
  'project_documents.NotFound': 'Document not found.',
  'project_documents.ProjectNotFound': 'The project for this document was not found.',
  'project_documents.FolderNotFound': 'The target folder was not found.',
  'project_documents.EmptyFile': 'The selected file is empty.',
  'project_documents.FileTooLarge': 'The file is larger than the allowed maximum.',
  'project_documents.FileMissing': 'The stored file is no longer available.',
  'project_documents.UploadFailed': 'Could not upload the document. Please try again.',
  'project_documents.MoveFailed': 'Could not move the document. Please try again.',
  'project_documents.DeleteFailed': 'Could not delete the document.',

  // From api-docs/09-documents-attachments-comments.md — task attachments
  'task_attachments.NotFound': 'Attachment not found.',
  'task_attachments.TaskNotFound': 'The task for this attachment was not found.',
  'task_attachments.EmptyFile': 'The selected file is empty.',
  'task_attachments.FileTooLarge': 'The file is larger than the allowed maximum.',
  'task_attachments.FileMissing': 'The stored file is no longer available.',
  'task_attachments.UploadFailed': 'Could not upload the attachment. Please try again.',
  'task_attachments.DeleteFailed': 'Could not delete the attachment.',
  'tasks.InvalidFileFormat': 'This file format is not allowed for this task.',
  'tasks.FileTooLarge': 'The file is larger than this task allows.',

  // From api-docs/09-documents-attachments-comments.md — task comments
  'task_comments.NotFound': 'Comment not found.',
  'task_comments.NotAuthorized':
    'Only the comment author or the task assignee can change this comment.',
  'task_comments.CreationFailed': 'Could not post the comment. Please try again.',
  'task_comments.UpdateFailed': 'Could not update the comment. Please try again.',
  'task_comments.DeleteFailed': 'Could not delete the comment.',

  // From api-docs/11-finance.md — cost categories
  'costCategories.NotFound': 'Cost category not found.',
  'costCategories.DuplicateCode': 'A cost category with this code already exists.',
  'costCategories.CreateFailed': 'Could not create the cost category. Please try again.',

  // From api-docs/11-finance.md — budget lines
  'budgetLines.NotFound': 'Budget line not found.',
  'budgetLines.CreateFailed': 'Could not create the budget line. Please try again.',

  // From api-docs/11-finance.md — ledger entries
  'ledgerEntries.NotFound': 'Ledger entry not found.',
  'ledgerEntries.InvalidDirection': 'That direction is not valid for this entry type.',
  'ledgerEntries.InsufficientBudget':
    'This commitment goes beyond the remaining budget for that line.',
  'ledgerEntries.DuplicatePosting': 'This entry has already been posted (same reference).',
  'ledgerEntries.AlreadyReversed': 'This entry has already been reversed.',

  // From api-docs/11-finance.md — ledger allocations
  'ledgerAllocations.ExceedsUnallocated':
    'The allocation is larger than what is left on this payment.',
  'ledgerAllocations.AmountMustBePositive': 'The allocation amount must be greater than zero.',

  // From api-docs/11-finance.md — invoices
  'invoices.NotFound': 'Invoice not found.',
  'invoices.DuplicateNumber': 'An invoice with this number already exists.',
  'invoices.InvalidParty': 'A client invoice needs a client; a vendor invoice needs a vendor name.',
  'invoices.NotEditable': 'This invoice can no longer be edited.',
  'invoices.AlreadyPaid': 'This invoice has already been paid.',

  // From api-docs/11-finance.md — variations
  'variations.NotFound': 'Variation not found.',
  'variations.NotDraft': 'Only draft variations can be edited.',
  'variations.NotApproved': 'This variation has not been approved yet.',
  'variations.InvalidClientDifference':
    'A client difference needs a task, a budgeted amount and a chosen amount.',
  'variations.InvalidInternalChange': 'An internal change needs a budget line.',
  'variations.DuplicateOpen': 'An open variation already exists for this task or budget line.',

  // From api-docs/11-finance.md — BOQ snapshots
  'boqSnapshots.NotFound': 'BOQ snapshot not found.',

  // ── CRM — client requirement gathering (feature 004) ──────────────────────
  // Codes mirrored from `Domain/Errors/Crm*Errors.cs` + `ApprovalErrors.cs`.
  // Never hand-parse an error body (constitution Principle V) — every CRM failure
  // path resolves through here.

  // Approvals (shared with the office decide flow; reused by the client portal).
  'approvals.AlreadyDecided': 'This approval has already been decided.',
  'approvals.CommentRequired': 'A comment is required to reject or request changes.',
  'approvals.NotFound': 'Approval not found.',
  'approvals.OpenApprovalExists': 'An undecided approval already exists for this subject.',
  'approvals.NotAssignedApprover': 'Only the assigned approver can decide this.',
  'approvals.InvalidSubject': 'Exactly one subject and one approver must be provided.',

  'crm.access.AccessDenied': 'You do not have access to this resource.',

  // Brief — the head and the append-only gathering ledger.
  'crm.briefs.NotFound': 'Design brief not found.',
  'crm.briefs.EntryNotFound': 'Gathering entry not found.',
  'crm.briefs.AlreadyExists': 'This stage already has a design brief.',
  'crm.briefs.NotPending': 'The brief is not pending approval.',
  'crm.briefs.EntryLocked': 'This entry is confirmed and locked. Add a new version to correct it.',
  'crm.briefs.EntryPending':
    "This entry is awaiting the client's confirmation and cannot be changed.",
  'crm.briefs.OnlyLockedSuperseded':
    'Only a confirmed entry can be superseded — unconfirmed entries are edited in place.',

  // Catalog (feature 006 — replaced the retired checklist error codes).
  'crm.catalog.NodeInUse': 'This node is recorded on a board — deactivate it instead of deleting.',
  'crm.catalog.CycleDetected': 'A node cannot be moved under itself or its own descendant.',
  'crm.catalog.CodeTaken': 'Another node at that destination already uses this code.',
  'crm.catalog.LeafCarriesBranchRule':
    'A selectable leaf cannot carry a selection mode or be required.',
  'crm.catalog.NotABranch': 'Attributes and children belong on a branch, not a selectable leaf.',
  'crm.catalog.NotSelectable': 'Only a selectable leaf can be recorded in a space.',
  'crm.catalog.NotApplicableToSpaceType': 'This item is not offered for this space type.',
  'crm.catalog.SingleRuleViolated': 'Only one item is allowed under this branch.',
  'crm.catalog.OptionsRequireSelect': 'Only a select attribute may carry options.',
  'crm.catalog.AttributeTypeMismatch': "The value does not match the attribute's type.",
  'crm.catalog.AttributeNotApplicable': 'This attribute is not one the item inherits.',

  // Custom board entries (F4) — the either/or add and the promote flow.
  'crm.catalog.CustomNameRequired': 'A custom entry must have a name and a category.',
  'crm.catalog.NotACustomEntry': 'This row already references a catalog item.',
  'crm.catalog.PromotionCategoryMismatch':
    'The chosen catalog item must be in the same category, or a category under it.',

  // Spaces + the board (feature 006).
  'crm.spaces.NameTaken': 'A space with this name already exists in the project.',
  'crm.spaces.SpaceInUse':
    'This space is referenced by an entry or a board — deactivate it instead.',
  'crm.spaces.SpaceNotFound': 'Space not found.',
  'crm.spaces.ProjectMismatch': 'That space belongs to a different project.',
  'crm.spaces.ItemAlreadyRecorded': 'That item is already on this space board.',

  // Contacts — the one-primary rule.
  'crm.contacts.NotFound': 'Contact not found.',
  'crm.contacts.PrimaryContactMissing': 'This client has no primary contact.',
  'crm.contacts.CannotRemovePrimary':
    'The primary contact cannot be removed — promote another contact first.',

  // Requirement items — append-only, with the client-authored asymmetry.
  'crm.items.NotFound': 'Requirement item not found.',
  'crm.items.ItemLocked': 'This item is trusted and locked. Add a new version to correct it.',
  'crm.items.NotPending': 'The item is not pending approval.',
  'crm.items.OnlyLockedSuperseded':
    'Only a trusted item can be superseded — unconfirmed items are edited in place.',
  'crm.items.InvalidSource': 'The source reference does not match the source type.',
  'crm.items.SendRequiresEmployeeAuthor':
    'Client-written requirements are trusted immediately and are never sent for confirmation.',
  'crm.items.NotPrimaryContact': "Only the client's primary contact can add requirements.",

  // Leads.
  'crm.leads.NotFound': 'Lead not found.',
  'crm.leads.AlreadyConverted': 'This lead has already been converted.',
  'crm.leads.InvalidStatusTransition':
    'Leads are converted through the convert action, not a status change.',
  'crm.leads.ConvertFailed': 'Could not convert the lead. Please try again.',
  'crm.leads.SectorMismatch': 'The sector detail block does not match the selected project sector.',
  'crm.leads.DesignerExperienceWithoutUse':
    'A designer experience can only be set when the client has used a designer before.',
  'crm.leads.ExperienceReasonWithoutExperience':
    'An experience reason requires the designer experience (positive/negative) to be set first.',

  // Meetings — the server computes availability; the client renders it.
  'crm.meetings.NotFound': 'Meeting not found.',
  'crm.meetings.SlotNotFound': 'Meeting slot not found.',
  'crm.meetings.InvalidRequester': 'Exactly one requester must be provided.',
  'crm.meetings.InvalidProposer': 'Exactly one proposer must be provided.',
  'crm.meetings.InvalidSlotRange': 'The slot must end after it starts.',
  'crm.meetings.SlotNotProposed': 'Only a proposed slot can be accepted or declined.',
  'crm.meetings.AlreadyStarted': 'This meeting has already started and can no longer be changed.',
  'crm.meetings.CancelReasonRequired': 'A reason is required when cancelling a meeting.',
  'crm.meetings.NotCounterparty': 'Only the other party can respond to this slot.',
  'crm.meetings.InvalidStateTransition': 'The meeting cannot move to that state.',
  'crm.meetings.NoSlotsProvided': 'Propose at least one time slot.',

  // Notes — internal, never rendered on a client surface (FR-016).
  'crm.notes.NotFound': 'Note not found.',
  'crm.notes.NotAuthor': 'Only the author can change this note.',

  // Requirement periods.
  'crm.periods.NotFound': 'Requirement period not found.',
  'crm.periods.NotOpen': 'The requirement period is not open.',
  'crm.periods.InvalidCloseTime': 'The close time must be in the future.',
  'crm.periods.OpenFailed': 'Could not open the requirement period. Please try again.',

  // Space types — server data, not an enum.
  'crm.space_types.NotFound': 'Space type not found.',
  'crm.space_types.CodeRequired': 'A space type code is required.',
  'crm.space_types.NameRequired': 'A space type name is required.',
  'crm.space_types.DuplicateCode': 'A space type with this code already exists.',

  // Attachments on CRM artifacts (Dependency 6).
  'crm.artifacts.NotFound': 'Attachment link not found.',
  'crm.artifacts.InvalidSubject': 'Exactly one subject must be provided.',
  'crm.artifacts.InvalidAuthor': 'Exactly one author must be provided.',
  'crm.artifacts.SubjectLocked':
    'This artifact is locked — its attachments are frozen. Attach evidence to the superseding entry instead.',
  'crm.artifacts.NotOwnArtifact': 'You can attach only to your own items and meetings.',

  // ── 009b X-2 — CRM-API-CONTRACT §5.1/§5.3 ─────────────────────────────────
  // From `Crm.Domain/Errors/Errors.cs`, `CrmAccessErrors` (`CrmAccessGuard.cs:110-134`) and
  // `Approvals.Domain/Errors/ApprovalErrors.cs`. Each has an Arabic twin in ERROR_MESSAGES_AR.
  'crm.access.Unauthenticated': 'We could not identify you. Please sign in again.',
  'crm.access.NoStanding': 'Your account has no active access to this area.',
  'crm.access.NotAnEmployee': 'Only an employee can do this.',
  'crm.access.NotAClient': 'Only a client can do this.',
  'crm.portal.NotFound': 'Nothing was found for that request.',
  'crm.portal.NotAClient': 'This page is for clients only.',
  'crm.clients.NotFound': 'Client not found.',
  'crm.clients.AddressRequired': 'An address is required.',
  'crm.clients.ChildNotFound': 'That child is not on this client.',
  'crm.clients.Inactive': 'This client is deactivated. Reactivate it before changing it.',
  'crm.clients.InvalidActiveFilter': 'The active filter must be all, active or inactive.',
  'crm.clients.ConcurrentUpdate':
    'The client was changed by someone else. Reload it and try again.',
  'crm.client_children.InvalidGender': 'Choose male or female.',
  'crm.client_children.InvalidAge': 'Age must be between 0 and 120.',
  'crm.contacts.ConcurrentPrimaryChange':
    'The primary contact was changed at the same time. Reload and try again.',
  'crm.contacts.NameRequired': 'First and last name are required.',
  'crm.leads.NameRequired': 'First and last name are required.',
  'crm.leads.OwnerNotFound': 'The owner must be an active employee.',
  'crm.leads.ResidentialWithoutSector':
    'Residential details can only be saved when the sector is Residential.',
  'crm.leads.ConcurrentUpdate': 'The lead was changed by someone else. Reload and try again.',
  'crm.leads.InvalidClientId': 'Choose a client to convert this lead.',
  'crm.briefs.UnitDetailsRequired':
    "Unit type and unit condition are required unless the lead's intake supplies them.",
  'crm.briefs.HeadLockedPendingApproval':
    "The brief head can't be edited while it is waiting for the client's decision.",
  'crm.briefs.NotSendable': 'Only a draft or rejected brief can be sent for approval.',
  'crm.briefs.ConcurrentSend': 'The brief was sent at the same time. Reload and try again.',
  'crm.briefs.TooManyVoidedRounds':
    'The brief could not open a new approval round. Try again later.',
  'crm.briefs.ConcurrencyConflict': 'The brief was changed by someone else. Reload and try again.',
  'crm.briefs.StageProjectMismatch': "That stage is not on this brief's project.",
  'crm.briefs.SpaceProjectMismatch': "That space is not on this brief's project.",
  'crm.briefs.TaskProjectMismatch': "That task is not on this brief's project.",
  'crm.briefs.TaskStageMismatch': "That task is not on this brief's stage.",
  'crm.briefs.MeetingProjectMismatch': "That meeting is not on this brief's project.",
  'crm.briefs.AlreadySuperseded': 'This entry has already been superseded.',
  'crm.briefs.ProjectNotFound': 'Project not found.',
  'crm.briefs.RoundNotFound': 'The brief has no such round.',
  'crm.briefs.SupersedeSpaceMismatch': 'A correction must stay on the same space as the original.',
  'crm.spaces.DuplicateName': 'A space with this name already exists in the project.',
  'crm.spaces.InvalidData': 'A space name is required.',
  'crm.spaces.UnknownSpaceType': 'That space type does not exist.',
  'crm.catalog.ItemNotFound': 'Catalog item not found.',
  'crm.catalog.CategoryNotFound': 'Catalog category not found.',
  'crm.catalog.AttributeNotFound': 'Catalog attribute not found.',
  'crm.catalog.InvalidData': 'A code and both English and Arabic names are required.',
  'crm.catalog.SpaceTypeNotFound': 'Space type not found.',
  'crm.catalog.MaxDepthExceeded': 'The category tree is already at its maximum depth.',
  'crm.catalog.CyclicMove': 'A category cannot be moved under itself or one of its descendants.',
  'crm.catalog.DuplicateMapping': 'This category is already mapped to this space type.',
  'crm.periods.AlreadyOpen': 'This project already has an open requirement period.',
  'crm.periods.ConcurrentUpdate':
    'The requirement period was changed by someone else. Reload and try again.',
  'crm.items.UnknownSpaceType': 'That space type does not exist or is inactive.',
  'crm.items.AlreadyPending': "This item is already waiting for the client's decision.",
  'crm.items.TooManyVoidedRounds':
    "This item's approval was voided too many times. Try again later.",
  'crm.items.AlreadySuperseded': 'This item has already been superseded.',
  'crm.items.ConcurrentUpdate': 'The item was changed by someone else. Reload and try again.',
  'crm.items.ProjectMismatch': "The project does not match the period's project.",
  'crm.items.TaskProjectMismatch': "That task is not on this item's project.",
  'crm.items.MeetingProjectMismatch': "That meeting is not on this item's project.",
  'crm.items.BriefProjectMismatch': "That brief is not on this item's project.",
  'crm.items.NoteProjectMismatch': "That note is not on this item's project or client.",
  'crm.meetings.SlotTooLong': 'A slot can last at most 8 hours.',
  'crm.meetings.ConcurrentUpdate': 'The meeting was changed by someone else. Reload and try again.',
  'crm.meetings.SlotExpired': "This slot's start time has passed. Propose a new time.",
  'crm.notes.ProjectMismatch': "The note's project does not belong to this client.",
  'crm.artifacts.DocumentNotFound': 'The document was not found on this project.',
  'crm.projects.Inactive': 'This project is inactive and takes no new CRM work.',
  'approvals.ApprovalIdInUse': 'This approval belongs to a different subject.',
  'approvals.Unauthenticated': 'We could not identify you. Please sign in again.',

  // ── 009b X-2 — scope of work and projects, CRM-API-CONTRACT §5.2 ──────────
  // From `Projects.Domain/Errors/Errors.cs`. `projects.NotFound` and `stage_templates.NotFound`
  // are already above; only their Arabic twins are new.
  'projects.AccessDenied': 'You do not have access to this project.',
  'projects.ClientNotFound': 'The client was not found or is inactive.',
  'projects.scope.Confirmed': 'The scope of work is confirmed and can no longer be changed.',
  'projects.scope.Empty': 'A scope of work needs at least one item to be confirmed.',
  'projects.scope.DurationRequired': 'Set the duration before confirming the scope of work.',
  'projects.scope.NegativeTotal': 'The total (fees plus adjustment) cannot be negative.',
  'projects.scope.AdjustmentNoteRequired': 'An adjustment needs a note explaining it.',
  'projects.scope.ProjectHasStages':
    "The project already has stages, so a scope of work can't be confirmed into it.",
  'projects.scope.SourceStageNotFound': 'A picked template stage no longer exists.',
  'projects.scope.WorkflowNotSupported': 'Only a stage-workflow project has a scope of work.',
  'projects.scope.DuplicateItem': 'That template stage is already in the scope of work.',
  'projects.scope.InvalidOrder': 'The new order must list every item of the scope exactly once.',
  'projects.scope.ConcurrentUpdate':
    'The scope of work was changed by someone else. Reload and try again.',
  'projects.scope.TooManyItems': 'A scope of work holds at most 50 items.',
  'projects.scope.ItemNotFound': 'That item is not in the scope of work.',
  'projects.scope.NegativeFee': 'A fee cannot be negative.',
  'teams.MissingHead': 'A department in a picked stage has no head. Assign one first.',
  // FINDING-5-13: an uncoded 403 (a route-permission refusal carries no code); not a backend
  // code — `friendly()` maps status 403 with no code to this key so the text can be localized.
  'http.Forbidden': "You don't have permission to do that.",
  // FINDING-7-10: the request validator's code (SharedKernel/Error.cs `ValidationError`).
  'Validation.General': 'Some values are invalid. Check the highlighted fields.',
  // crm-prod M7: backend codes the catalog was missing (Crm.Domain Errors.cs, ApprovalErrors.cs).
  'crm.clients.AppUserIdRequired': 'A linked user account is required.',
  'crm.briefs.NotDraft': 'The intake can only be copied into a draft brief head.',
  'crm.spaces.ItemNotFound': 'Space item not found.',
  'crm.gates.UnsupportedOwner': 'This gate condition can only be set on a stage.',
  'crm.portal.InvalidDecision': 'Choose Approve or Request changes.',
  'crm.portal.InvalidStatus': "The status filter must be 'pending' or 'decided'.",
  'approvals.CommentTooLong': 'The comment must be 2000 characters or fewer.',
};

/**
 * Arabic twins of ERROR_MESSAGES (009b X-2). Partial by design: a code with no Arabic entry
 * falls back to its English message, never to a blank. Every code added from 009b on gets an
 * entry here as well as in ERROR_MESSAGES.
 */
export const ERROR_MESSAGES_AR: Record<string, string> = {
  // CRM-API-CONTRACT §5.1/§5.3
  'crm.access.Unauthenticated': 'تعذّر التعرّف عليك. يرجى تسجيل الدخول مرة أخرى.',
  'crm.access.NoStanding': 'ليس لحسابك وصول فعّال إلى هذا القسم.',
  'crm.access.NotAnEmployee': 'هذا الإجراء متاح للموظفين فقط.',
  'crm.access.NotAClient': 'هذا الإجراء متاح للعملاء فقط.',
  'crm.portal.NotFound': 'لم يُعثر على شيء لهذا الطلب.',
  'crm.portal.NotAClient': 'هذه الصفحة مخصّصة للعملاء فقط.',
  'crm.clients.NotFound': 'العميل غير موجود.',
  'crm.clients.AddressRequired': 'العنوان مطلوب.',
  'crm.clients.ChildNotFound': 'هذا الطفل غير مسجّل لدى هذا العميل.',
  'crm.clients.Inactive': 'هذا العميل غير مفعّل. أعِد تفعيله قبل تعديله.',
  'crm.clients.InvalidActiveFilter': 'يجب أن يكون مرشّح الحالة: الكل أو مفعّل أو غير مفعّل.',
  'crm.clients.ConcurrentUpdate': 'عدّل شخص آخر بيانات العميل. أعِد التحميل وحاول مرة أخرى.',
  'crm.client_children.InvalidGender': 'اختر ذكرًا أو أنثى.',
  'crm.client_children.InvalidAge': 'يجب أن يكون العمر بين 0 و120.',
  'crm.contacts.ConcurrentPrimaryChange':
    'تغيّرت جهة الاتصال الرئيسية في الوقت نفسه. أعِد التحميل وحاول مرة أخرى.',
  'crm.contacts.NameRequired': 'الاسم الأول واسم العائلة مطلوبان.',
  'crm.leads.NameRequired': 'الاسم الأول واسم العائلة مطلوبان.',
  'crm.leads.OwnerNotFound': 'يجب أن يكون المسؤول موظفًا مفعّلًا.',
  'crm.leads.ResidentialWithoutSector': 'لا تُحفظ التفاصيل السكنية إلا عندما يكون القطاع سكنيًا.',
  'crm.leads.ConcurrentUpdate': 'عدّل شخص آخر هذا العميل المحتمل. أعِد التحميل وحاول مرة أخرى.',
  'crm.leads.InvalidClientId': 'اختر عميلًا لتحويل هذا العميل المحتمل.',
  // 009b #6: the lead intake editor is bilingual.
  'crm.leads.AlreadyConverted': 'تم تحويل هذا العميل المحتمل بالفعل.',
  'crm.leads.DesignerExperienceWithoutUse':
    'لا يمكن تحديد تجربة المصمم إلا إذا سبق للعميل التعامل مع مصمم.',
  'crm.leads.ExperienceReasonWithoutExperience': 'يتطلب سبب التجربة تحديد تجربة المصمم أولًا.',
  'crm.briefs.NotFound': 'موجز التصميم غير موجود.',
  'crm.briefs.AlreadyExists': 'لهذه المرحلة موجز تصميم بالفعل.',
  'crm.briefs.NotPending': 'الموجز ليس بانتظار الاعتماد.',
  'approvals.OpenApprovalExists': 'يوجد بالفعل اعتماد لم يُبتّ فيه لهذا العنصر.',
  'crm.briefs.OnlyLockedSuperseded':
    'لا يُستبدل إلا قيد مؤكَّد — القيود غير المؤكدة تُعدَّل في مكانها.',
  'crm.briefs.UnitDetailsRequired':
    'نوع الوحدة وحالتها مطلوبان ما لم تكن بيانات العميل المحتمل تتضمّنهما.',
  'crm.briefs.HeadLockedPendingApproval': 'لا يمكن تعديل رأس الموجز وهو بانتظار قرار العميل.',
  'crm.briefs.NotSendable': 'لا يُرسل للاعتماد إلا موجز في حالة مسودة أو مرفوض.',
  'crm.briefs.ConcurrentSend': 'أُرسل الموجز في الوقت نفسه. أعِد التحميل وحاول مرة أخرى.',
  'crm.briefs.TooManyVoidedRounds': 'تعذّر فتح جولة اعتماد جديدة للموجز. حاول لاحقًا.',
  'crm.briefs.ConcurrencyConflict': 'عدّل شخص آخر الموجز. أعِد التحميل وحاول مرة أخرى.',
  'crm.briefs.StageProjectMismatch': 'هذه المرحلة ليست ضمن مشروع الموجز.',
  'crm.briefs.SpaceProjectMismatch': 'هذه المساحة ليست ضمن مشروع الموجز.',
  'crm.briefs.TaskProjectMismatch': 'هذه المهمة ليست ضمن مشروع الموجز.',
  'crm.briefs.TaskStageMismatch': 'هذه المهمة ليست ضمن مرحلة الموجز.',
  'crm.briefs.MeetingProjectMismatch': 'هذا الاجتماع ليس ضمن مشروع الموجز.',
  'crm.briefs.AlreadySuperseded': 'حلّ محل هذا القيد قيدٌ آخر بالفعل.',
  'crm.briefs.ProjectNotFound': 'المشروع غير موجود.',
  'crm.briefs.RoundNotFound': 'لا توجد جولة بهذا الرقم في الموجز.',
  'crm.briefs.SupersedeSpaceMismatch': 'يجب أن يبقى التصحيح على مساحة القيد الأصلي نفسها.',
  'crm.spaces.DuplicateName': 'توجد مساحة بهذا الاسم في المشروع بالفعل.',
  'crm.spaces.InvalidData': 'اسم المساحة مطلوب.',
  'crm.spaces.UnknownSpaceType': 'نوع المساحة هذا غير موجود.',
  'crm.catalog.ItemNotFound': 'عنصر الكتالوج غير موجود.',
  'crm.catalog.CategoryNotFound': 'فئة الكتالوج غير موجودة.',
  'crm.catalog.AttributeNotFound': 'خاصية الكتالوج غير موجودة.',
  'crm.catalog.InvalidData': 'الرمز والاسمان الإنجليزي والعربي مطلوبة.',
  'crm.catalog.SpaceTypeNotFound': 'نوع المساحة غير موجود.',
  'crm.catalog.MaxDepthExceeded': 'شجرة الفئات بلغت أقصى عمق مسموح به.',
  'crm.catalog.CyclicMove': 'لا يمكن نقل فئة تحت نفسها أو تحت إحدى فئاتها الفرعية.',
  'crm.catalog.DuplicateMapping': 'هذه الفئة مرتبطة بنوع المساحة هذا بالفعل.',
  'crm.periods.AlreadyOpen': 'لدى هذا المشروع فترة جمع متطلبات مفتوحة بالفعل.',
  'crm.periods.ConcurrentUpdate': 'عدّل شخص آخر فترة جمع المتطلبات. أعِد التحميل وحاول مرة أخرى.',
  'crm.items.UnknownSpaceType': 'نوع المساحة غير موجود أو غير مفعّل.',
  'crm.items.AlreadyPending': 'هذا البند بانتظار قرار العميل بالفعل.',
  'crm.items.TooManyVoidedRounds': 'أُلغي اعتماد هذا البند مرات كثيرة. حاول لاحقًا.',
  'crm.items.AlreadySuperseded': 'حلّ محل هذا البند بندٌ آخر بالفعل.',
  'crm.items.ConcurrentUpdate': 'عدّل شخص آخر هذا البند. أعِد التحميل وحاول مرة أخرى.',
  'crm.items.ProjectMismatch': 'المشروع لا يطابق مشروع الفترة.',
  'crm.items.TaskProjectMismatch': 'هذه المهمة ليست ضمن مشروع البند.',
  'crm.items.MeetingProjectMismatch': 'هذا الاجتماع ليس ضمن مشروع البند.',
  'crm.items.BriefProjectMismatch': 'هذا الموجز ليس ضمن مشروع البند.',
  'crm.items.NoteProjectMismatch': 'هذه الملاحظة ليست ضمن مشروع البند أو عميله.',
  'crm.meetings.SlotTooLong': 'لا يتجاوز الموعد 8 ساعات.',
  // 009b #20: the propose form's codes.
  'crm.meetings.InvalidSlotRange': 'يجب أن ينتهي الموعد بعد بدايته.',
  'crm.meetings.NoSlotsProvided': 'اقترح موعدًا واحدًا على الأقل.',
  'crm.periods.NotFound': 'فترة جمع المتطلبات غير موجودة.',
  'crm.periods.NotOpen': 'فترة جمع المتطلبات ليست مفتوحة.',
  // 009b #21: the slot and meeting actions' codes.
  'crm.meetings.InvalidStateTransition': 'لا يمكن نقل الاجتماع إلى هذه الحالة.',
  'crm.meetings.NotCounterparty': 'لا يردّ على هذا الموعد إلا الطرف الآخر.',
  'crm.meetings.SlotNotFound': 'الموعد غير موجود.',
  'crm.meetings.ConcurrentUpdate': 'عدّل شخص آخر الاجتماع. أعِد التحميل وحاول مرة أخرى.',
  'crm.meetings.SlotExpired': 'مضى وقت بدء هذا الموعد. اقترح وقتًا جديدًا.',
  // FINDING-5-2: the two slot/meeting codes rows 20/21 left without Arabic.
  'crm.meetings.SlotNotProposed': 'لا يُقبل أو يُرفض إلا موعد مقترح.',
  'crm.meetings.AlreadyStarted': 'بدأ هذا الاجتماع بالفعل ولم يعد تغييره ممكنًا.',
  // FINDING-5-9: CRM codes X-2 left without Arabic.
  'crm.meetings.CancelReasonRequired': 'يلزم ذكر سبب عند إلغاء الاجتماع.',
  'crm.meetings.NotFound': 'الاجتماع غير موجود.',
  'crm.periods.InvalidCloseTime': 'يجب أن يكون وقت الإغلاق في المستقبل.',
  'crm.items.ItemLocked': 'هذا البند موثوق ومقفل. أضف نسخة جديدة لتصحيحه.',
  'crm.items.NotPending': 'البند ليس بانتظار الاعتماد.',
  'crm.items.OnlyLockedSuperseded':
    'لا يُستبدل إلا بند موثوق — البنود غير المؤكدة تُعدَّل في مكانها.',
  'crm.items.InvalidSource': 'مرجع المصدر لا يطابق نوع المصدر.',
  'crm.notes.ProjectMismatch': 'مشروع الملاحظة لا يخص هذا العميل.',
  'crm.notes.NotAuthor': 'لا يعدّل هذه الملاحظة إلا كاتبها.',
  'crm.artifacts.DocumentNotFound': 'المستند غير موجود في هذا المشروع.',
  'crm.projects.Inactive': 'هذا المشروع غير مفعّل ولا يقبل عملًا جديدًا.',
  'approvals.ApprovalIdInUse': 'هذا الاعتماد يخص عنصرًا آخر.',
  'approvals.CommentRequired': 'يلزم تعليق للرفض أو لطلب تعديلات.',
  'approvals.Unauthenticated': 'تعذّر التعرّف عليك. يرجى تسجيل الدخول مرة أخرى.',

  // CRM-API-CONTRACT §5.2 — scope of work and projects
  'projects.NotFound': 'المشروع غير موجود.',
  'projects.AccessDenied': 'ليس لديك وصول إلى هذا المشروع.',
  'projects.ClientNotFound': 'العميل غير موجود أو غير مفعّل.',
  'projects.scope.Confirmed': 'نطاق العمل مؤكَّد ولم يعد قابلًا للتعديل.',
  'projects.scope.Empty': 'يحتاج نطاق العمل إلى بند واحد على الأقل لتأكيده.',
  'projects.scope.DurationRequired': 'حدّد المدة قبل تأكيد نطاق العمل.',
  'projects.scope.NegativeTotal': 'لا يمكن أن يكون الإجمالي (الأتعاب مع التعديل) سالبًا.',
  'projects.scope.AdjustmentNoteRequired': 'يحتاج التعديل إلى ملاحظة توضّحه.',
  'projects.scope.ProjectHasStages': 'للمشروع مراحل بالفعل، فلا يمكن تأكيد نطاق عمل فيه.',
  'projects.scope.SourceStageNotFound': 'إحدى مراحل القالب المختارة لم تعد موجودة.',
  'projects.scope.WorkflowNotSupported': 'نطاق العمل متاح لمشاريع سير العمل بالمراحل فقط.',
  'projects.scope.DuplicateItem': 'مرحلة القالب هذه موجودة في نطاق العمل بالفعل.',
  'projects.scope.InvalidOrder': 'يجب أن يذكر الترتيب الجديد كل بند في النطاق مرة واحدة.',
  'projects.scope.ConcurrentUpdate': 'عدّل شخص آخر نطاق العمل. أعِد التحميل وحاول مرة أخرى.',
  'projects.scope.TooManyItems': 'يتّسع نطاق العمل لـ 50 بندًا على الأكثر.',
  'projects.scope.ItemNotFound': 'هذا البند ليس في نطاق العمل.',
  'projects.scope.NegativeFee': 'لا يمكن أن تكون الأتعاب سالبة.',
  'stage_templates.NotFound': 'قالب المرحلة غير موجود.',
  'teams.MissingHead': 'أحد الأقسام في مرحلة مختارة بلا رئيس. عيّن رئيسًا أولًا.',
  // FINDING-5-13: an uncoded 403 (route permission) — `friendly()` maps it to this key.
  'http.Forbidden': 'ليس لديك صلاحية للقيام بذلك.',
  // FINDING-7-10: the request validator's code.
  'Validation.General': 'بعض القيم غير صحيحة. راجع الحقول المحدَّدة.',
  // crm-prod M7: Arabic for every CRM, scope and approvals code the UI can reach.
  'crm.clients.AppUserIdRequired': 'يلزم ربط حساب مستخدم.',
  'crm.contacts.NotFound': 'جهة الاتصال غير موجودة.',
  'crm.leads.NotFound': 'العميل المحتمل غير موجود.',
  'crm.leads.InvalidStatusTransition':
    'يُحوَّل العميل المحتمل من خلال إجراء التحويل، لا بتغيير الحالة.',
  'crm.briefs.NotDraft': 'لا تُنسخ بيانات الاستقبال إلا إلى رأس موجز في حالة مسودة.',
  'crm.briefs.EntryLocked': 'هذا القيد مؤكَّد ومقفل. أضف نسخة جديدة لتصحيحه.',
  'crm.briefs.EntryPending': 'هذا القيد بانتظار تأكيد العميل ولا يمكن تغييره.',
  'crm.spaces.SpaceNotFound': 'المساحة غير موجودة.',
  'crm.spaces.ItemNotFound': 'عنصر المساحة غير موجود.',
  'crm.space_types.CodeRequired': 'رمز نوع المساحة مطلوب.',
  'crm.space_types.NotFound': 'نوع المساحة غير موجود.',
  'crm.space_types.DuplicateCode': 'يوجد نوع مساحة بهذا الرمز بالفعل.',
  'crm.space_types.NameRequired': 'اسم نوع المساحة مطلوب.',
  'crm.catalog.CustomNameRequired': 'يجب أن يكون للعنصر المخصّص اسم وفئة.',
  'crm.catalog.NotACustomEntry': 'هذا الصف مرتبط بعنصر من الكتالوج بالفعل.',
  'crm.catalog.AttributeTypeMismatch': 'القيمة لا تطابق نوع الخاصية.',
  'crm.items.NotFound': 'بند المتطلبات غير موجود.',
  'crm.items.SendRequiresEmployeeAuthor':
    'المتطلبات التي يكتبها العميل موثوقة فورًا ولا تُرسل للتأكيد.',
  'crm.artifacts.InvalidSubject': 'يجب تحديد موضوع واحد بالضبط.',
  'crm.artifacts.InvalidAuthor': 'يجب تحديد كاتب واحد بالضبط.',
  'crm.notes.NotFound': 'الملاحظة غير موجودة.',
  'crm.gates.UnsupportedOwner': 'لا يُضبط شرط البوابة هذا إلا على مرحلة.',
  'crm.meetings.InvalidRequester': 'يجب تحديد طالب واحد بالضبط.',
  'crm.meetings.InvalidProposer': 'يجب تحديد مقترِح واحد بالضبط.',
  'crm.portal.InvalidDecision': 'اختر الاعتماد أو طلب تعديلات.',
  'crm.portal.InvalidStatus': 'يجب أن يكون مرشّح الحالة: بانتظار القرار أو تم البتّ.',
  'approvals.AlreadyDecided': 'تم البتّ في هذا الاعتماد بالفعل.',
  'approvals.NotFound': 'الاعتماد غير موجود.',
  'approvals.CommentTooLong': 'يجب ألا يتجاوز التعليق 2000 حرف.',
  'approvals.NotAssignedApprover': 'لا يبتّ في هذا الاعتماد إلا المعتمِد المكلَّف.',
  'approvals.InvalidSubject': 'يجب تحديد موضوع واحد ومعتمِد واحد بالضبط.',
};

/**
 * Look up the friendly message for a backend error code, with a fallback. Under `ar` the
 * Arabic entry wins, then the English one (009b X-2).
 */
export function friendlyMessage(
  code: string | null,
  fallback: string,
  locale: 'en' | 'ar' = 'en',
): string {
  if (!code) return fallback;
  return (locale === 'ar' && ERROR_MESSAGES_AR[code]) || ERROR_MESSAGES[code] || fallback;
}

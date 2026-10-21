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

  // From api-docs/04-departments.md
  'departments.NotFound': 'Department not found.',
  'departments.DuplicatedName': 'A department with this name already exists.',
  'departments.AlreadyInDepartment': 'This employee is already in that department.',
  'departments.UserNotInDepartment': 'This employee is not in the selected department.',
  'departments.NoEmployeesToMove': 'There are no employees to move in this department.',

  // From api-docs/05-roles-permissions.md
  'roles.NotFound': 'Role not found.',
  'roles.DuplicatedRole': 'A role with this name already exists.',
  'roles.UserNotInRole': 'The user does not have this role.',
  'permissions.InvalidPermission': 'That permission is not recognized by the system.',
  'permissions.PermissionOverrideAlreadyExists':
    'An override for this permission already exists for that user.',
  'permissions.PermissionOverrideNotFound': 'No override exists for this permission.',
  'permissions.NotFoundForTarget': 'This permission is not set for the selected target.',

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
  'approvals.CommentRequired': 'A comment is required when rejecting.',
  'approvals.NotFound': 'Approval not found.',
  'approvals.OpenApprovalExists': 'An undecided approval already exists for this subject.',
  'approvals.NotAssignedApprover': 'Only the assigned approver can decide this.',
  'approvals.InvalidSubject': 'Exactly one subject and one approver must be provided.',
  'approvals.DecisionFailed': 'The decision could not be processed. Please try again.',

  'crm.access.AccessDenied': 'You do not have access to this resource.',

  // Brief — the head and the append-only gathering ledger.
  'crm.briefs.NotFound': 'Design brief not found.',
  'crm.briefs.EntryNotFound': 'Gathering entry not found.',
  'crm.briefs.AlreadyExists': 'A design brief already exists for this project.',
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
  'crm.meetings.SlotUnavailable': 'That time is no longer available. Please pick another slot.',
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
  'crm.periods.OpenPeriodExists': 'An open requirement period already exists for this project.',
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
};

/** Look up the friendly message for a backend error code, with a fallback. */
export function friendlyMessage(code: string | null, fallback: string): string {
  return (code && ERROR_MESSAGES[code]) || fallback;
}

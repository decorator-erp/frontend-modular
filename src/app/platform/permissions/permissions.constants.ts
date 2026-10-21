/**
 * Authoritative permission catalog.
 *
 * Every string below is a verbatim mirror of the live claim spelling the server issues and gates
 * on. There is no doc-vs-claim translation layer: `PermissionsService.can()` and `PermissionGuard`
 * check these strings directly against the caller's `permissions` claim set. Do not invent keys
 * here — add them only when they appear in the backend catalog.
 *
 * SOURCE OF TRUTH. There is no single `DefaultPermissions.cs` (an earlier version of this header
 * cited one; it does not exist in dms-modular). Each module declares its own constants —
 * `IdentityPermissions.cs`, `HrPermissions.cs`, `CrmPermissions.cs`, … — and
 * `PermissionCatalog.All()` unions them at runtime. `GET /api/permissions` returns exactly that
 * union, so the server is always the arbiter; this file only has to agree with it.
 *
 * IDENTITY IS COARSE ON PURPOSE. The rewrite collapsed Identity to FOUR permissions —
 * `users.read`, `roles.read`, `roles.manage`, `permissions.manage`. The finer-grained key names
 * below (`roles.create`, `permissions.grant`, …) are kept as ALIASES onto those four so that every
 * existing call site keeps compiling and reads naturally at the point of use. They are not
 * separate capabilities: granting `roles.manage` grants all of create, update, delete and
 * role-assignment at once. Do not add a new alias expecting finer control than the server has.
 */
export const PERM = {
  employees: {
    read: 'employees.read',
    viewOwn: 'employees.view_own',
    update: 'employees.update',
    setActive: 'employees.set_active',
    create: 'employees.create',
    // TODO(backend-gap): no DELETE /api/employees/{id} exists — this constant gates nothing, and
    // deactivate is the only removal path in HR.
    delete: 'employees.delete',
  },
  clients: {
    read: 'clients.read',
    update: 'clients.update',
    setActive: 'clients.set_active',
    manageChildren: 'clients.manage_children',
    create: 'clients.create',
    delete: 'clients.delete',
  },
  users: {
    // TODO(backend-gap): assignable and in the runtime catalog, but no endpoint anywhere calls
    // RequirePermission with it — there is no /api/users group to gate. Granting it does nothing.
    read: 'users.read',
  },
  roles: {
    read: 'roles.read',
    manage: 'roles.manage',
    // Aliases onto `roles.manage` — the backend has no finer split. See the file header.
    update: 'roles.manage',
    create: 'roles.manage',
    assignToUser: 'roles.manage',
    removeFromUser: 'roles.manage',
    delete: 'roles.manage',
  },
  departments: {
    read: 'departments.read',
    viewUsers: 'departments.view_users',
    update: 'departments.update',
    setActive: 'departments.set_active',
    create: 'departments.create',
    delete: 'departments.delete',
    // TODO(backend-gap): departments have no reactivate route — delete is a one-way soft delete,
    // so `departments.set_active` above gates nothing.
    assignDepartmentHead: 'departments.assign_department_head',
    unassignDepartmentHead: 'departments.unassign_department_head',
    assignToUser: 'departments.assign_to_user',
    removeFromUser: 'departments.remove_from_user',
    moveUser: 'departments.move_user',
  },
  permissions: {
    manage: 'permissions.manage',
    // Aliases onto `permissions.manage` — user-level override reads and writes share one gate.
    read: 'permissions.manage',
    grant: 'permissions.manage',
    deny: 'permissions.manage',
    revoke: 'permissions.manage',
    // Role-permission writes are gated on ROLES, not permissions:
    // PUT/DELETE /api/permissions/roles/{roleId}/{permission} require `roles.manage`.
    assignToRole: 'roles.manage',
    removeFromRole: 'roles.manage',
  },
  audit: {
    read: 'audit.read',
    viewOwn: 'audit.view_own',
  },
  activities: {
    read: 'activities.read',
  },
  notifications: {
    viewOwn: 'notifications.view_own',
  },
  projects: {
    read: 'project.read',
    readAll: 'project.read_all',
    create: 'project.create',
    update: 'project.update',
    setActive: 'project.set_active',
    changeStatus: 'project.change_status',
    delete: 'project.delete',
  },
  stages: {
    read: 'stages.read',
    manage: 'stages.manage',
    complete: 'stages.complete',
    approve: 'stages.approve',
    reject: 'stages.reject',
    manageGates: 'stages.manage_gates',
  },
  stageTeams: {
    manage: 'stage_teams.manage',
  },
  stageTasks: {
    read: 'stage_tasks.read',
    manage: 'stage_tasks.manage',
    assign: 'stage_tasks.assign',
    complete: 'stage_tasks.complete',
    requestApproval: 'stage_tasks.request_approval',
    decideApproval: 'stage_tasks.decide_approval',
    manageGates: 'stage_tasks.manage_gates',
  },
  documents: {
    read: 'documents.read',
    upload: 'documents.upload',
    update: 'documents.update',
    delete: 'documents.delete',
  },
  approvals: {
    read: 'approvals.read',
    decide: 'approvals.decide',
  },
  fileTemplates: {
    read: 'file_templates.read',
    manage: 'file_templates.manage',
  },
  finance: {
    read: 'finance.read',
    manageCostCategory: 'finance.manage_cost_category',
    manageBudget: 'finance.manage_budget',
    recordPayment: 'finance.record_payment',
    reversePayment: 'finance.reverse_payment',
    manageInvoice: 'finance.manage_invoice',
    cancelInvoice: 'finance.cancel_invoice',
    manageVariation: 'finance.manage_variation',
    approveVariation: 'finance.variations.approve',
    signVariation: 'finance.variations.sign',
    applyVariation: 'finance.variations.apply',
    generateBoq: 'finance.generate_boq',
  },
  /**
   * CRM. Mirrors the split `Crm` / `Crm*` groups in the backend catalog. Office-side
   * strings gate the client hub and 004 workspace; the `_own` strings gate the client
   * portal's self-scoped surfaces.
   */
  crm: {
    /** Client-portal shell / nav flag — gates no endpoint; marks the Client role portal-eligible. */
    portal: 'crm.portal',
    leads: {
      read: 'crm.leads.read',
      create: 'crm.leads.create',
      update: 'crm.leads.update',
      changeStatus: 'crm.leads.change_status',
      convert: 'crm.leads.convert',
    },
    contacts: {
      read: 'crm.contacts.read',
      create: 'crm.contacts.create',
      update: 'crm.contacts.update',
      setPrimary: 'crm.contacts.set_primary',
    },
    periods: {
      read: 'crm.periods.read',
      open: 'crm.periods.open',
      extend: 'crm.periods.extend',
      close: 'crm.periods.close',
    },
    items: {
      read: 'crm.items.read',
      create: 'crm.items.create',
      update: 'crm.items.update',
      send: 'crm.items.send',
      supersede: 'crm.items.supersede',
    },
    notes: {
      read: 'crm.notes.read',
      create: 'crm.notes.create',
      update: 'crm.notes.update',
      delete: 'crm.notes.delete',
    },
    designProfile: {
      read: 'crm.design_profile.read',
    },
    meetings: {
      // Office-side.
      read: 'crm.meetings.read',
      schedule: 'crm.meetings.schedule',
      respondSlot: 'crm.meetings.respond_slot',
      reschedule: 'crm.meetings.reschedule',
      cancel: 'crm.meetings.cancel',
      complete: 'crm.meetings.complete',
      markNoShow: 'crm.meetings.mark_no_show',
      // Client portal (self-scoped).
      viewOwn: 'crm.meetings.view_own',
      requestOwn: 'crm.meetings.request_own',
      respondOwn: 'crm.meetings.respond_own',
    },
    artifacts: {
      read: 'crm.artifacts.read',
      manage: 'crm.artifacts.manage',
    },
    briefs: {
      read: 'crm.briefs.read',
      manage: 'crm.briefs.manage',
      send: 'crm.briefs.send',
      // Client portal (self-scoped).
      viewOwn: 'crm.briefs.view_own',
    },
    spaceTypes: {
      read: 'crm.space_types.read',
      manage: 'crm.space_types.manage',
    },
    // ── Catalog + spaces (feature 006 — replaced the retired checklist permissions) ──
    /** The global catalog tree, attributes, and space-type targeting. */
    catalog: {
      read: 'crm.catalog.read',
      manage: 'crm.catalog.manage',
    },
    /** Per-project room registry, the board, and provisioning. */
    spaces: {
      read: 'crm.spaces.read',
      manage: 'crm.spaces.manage',
    },
    approvals: {
      // Client portal (self-scoped).
      viewOwn: 'crm.approvals.view_own',
      decideOwn: 'crm.approvals.decide_own',
    },
  },
  /** Client portal (self-scoped) requirement-item authoring/reading. */
  requirements: {
    viewOwn: 'requirements.view_own',
    submitOwn: 'requirements.submit_own',
  },
  portal: {
    /** GET /api/crm/portal/profile — the client's identity card (client + contacts + projects). */
    profileViewOwn: 'portal.profile.view_own',
  },
  // UI-side gate for the redesigned DMS task-detail route. Not in the backend catalog
  // (`AllDefaultPermissions`); a staged-rollout claim backend ops grant explicitly —
  // see docs/PERMISSIONS.md. Kept in the app's live snake_case claim spelling.
  dms: {
    taskDetail: {
      view: 'dms.task_detail.view',
    },
  },
} as const;

/** Catalog used by the Roles & Permissions matrix UI. */
export const ALL_PERMISSIONS: { group: string; key: string; displayName: string }[] = [
  { group: 'Employees', key: PERM.employees.read, displayName: 'Read Employees' },
  { group: 'Employees', key: PERM.employees.viewOwn, displayName: 'View Own Profile' },
  { group: 'Employees', key: PERM.employees.create, displayName: 'Create Employees' },
  { group: 'Employees', key: PERM.employees.update, displayName: 'Update Employees' },
  {
    group: 'Employees',
    key: PERM.employees.setActive,
    displayName: 'Activate/Deactivate Employees',
  },
  { group: 'Employees', key: PERM.employees.delete, displayName: 'Delete Employees' },
  { group: 'Clients', key: PERM.clients.read, displayName: 'Read Clients' },
  { group: 'Clients', key: PERM.clients.create, displayName: 'Create Clients' },
  { group: 'Clients', key: PERM.clients.update, displayName: 'Update Clients' },
  { group: 'Clients', key: PERM.clients.setActive, displayName: 'Activate/Deactivate Clients' },
  { group: 'Clients', key: PERM.clients.manageChildren, displayName: 'Manage Client Sub-accounts' },
  { group: 'Clients', key: PERM.clients.delete, displayName: 'Delete Clients' },
  { group: 'Departments', key: PERM.departments.read, displayName: 'Read Departments' },
  { group: 'Departments', key: PERM.departments.create, displayName: 'Create Departments' },
  { group: 'Departments', key: PERM.departments.update, displayName: 'Update Departments' },
  {
    group: 'Departments',
    key: PERM.departments.setActive,
    displayName: 'Activate/Deactivate Departments',
  },
  { group: 'Departments', key: PERM.departments.delete, displayName: 'Delete Departments' },
  { group: 'Departments', key: PERM.departments.viewUsers, displayName: 'View Dept Members' },
  {
    group: 'Departments',
    key: PERM.departments.assignToUser,
    displayName: 'Assign Employee to Dept',
  },
  {
    group: 'Departments',
    key: PERM.departments.removeFromUser,
    displayName: 'Remove Employee from Dept',
  },
  { group: 'Departments', key: PERM.departments.moveUser, displayName: 'Move Employee' },
  {
    group: 'Departments',
    key: PERM.departments.assignDepartmentHead,
    displayName: 'Assign Dept Head',
  },
  {
    group: 'Departments',
    key: PERM.departments.unassignDepartmentHead,
    displayName: 'Unassign Dept Head',
  },
  // Identity's whole surface is these four. The twelve fine-grained rows that used to sit here
  // collapsed when the backend coarsened Identity — listing the aliases separately would render
  // the same capability up to five times and break this file's own no-duplicate-keys spec.
  { group: 'Identity', key: PERM.users.read, displayName: 'Read users' },
  { group: 'Roles', key: PERM.roles.read, displayName: 'Read roles' },
  {
    group: 'Roles',
    key: PERM.roles.manage,
    displayName: 'Manage roles (create, update, delete, assign to users, set role permissions)',
  },
  {
    group: 'Permissions',
    key: PERM.permissions.manage,
    displayName: 'Manage user permission overrides',
  },
  { group: 'Projects', key: PERM.projects.read, displayName: 'Read Projects' },
  {
    group: 'Projects',
    key: PERM.projects.readAll,
    displayName: 'Read All Projects (bypass team scope)',
  },
  { group: 'Projects', key: PERM.projects.create, displayName: 'Create Projects' },
  { group: 'Projects', key: PERM.projects.update, displayName: 'Update Projects' },
  { group: 'Projects', key: PERM.projects.setActive, displayName: 'Activate/Deactivate Projects' },
  { group: 'Projects', key: PERM.projects.changeStatus, displayName: 'Change Project Status' },
  { group: 'Projects', key: PERM.projects.delete, displayName: 'Delete Projects' },
  { group: 'Stages', key: PERM.stages.read, displayName: 'Read Stages' },
  { group: 'Stages', key: PERM.stages.manage, displayName: 'Manage Stages' },
  { group: 'Stages', key: PERM.stages.complete, displayName: 'Complete Stage' },
  { group: 'Stages', key: PERM.stages.approve, displayName: 'Approve Stage' },
  { group: 'Stages', key: PERM.stages.reject, displayName: 'Reject Stage' },
  { group: 'Stages', key: PERM.stages.manageGates, displayName: 'Manage Stage Gates' },
  { group: 'Stage Teams', key: PERM.stageTeams.manage, displayName: 'Manage Stage Teams' },
  { group: 'Stage Tasks', key: PERM.stageTasks.read, displayName: 'Read Tasks' },
  { group: 'Stage Tasks', key: PERM.stageTasks.manage, displayName: 'Manage Tasks' },
  { group: 'Stage Tasks', key: PERM.stageTasks.assign, displayName: 'Assign Task' },
  { group: 'Stage Tasks', key: PERM.stageTasks.complete, displayName: 'Complete Task' },
  {
    group: 'Stage Tasks',
    key: PERM.stageTasks.requestApproval,
    displayName: 'Request Task Approval',
  },
  {
    group: 'Stage Tasks',
    key: PERM.stageTasks.decideApproval,
    displayName: 'Decide Task Approval',
  },
  { group: 'Stage Tasks', key: PERM.stageTasks.manageGates, displayName: 'Manage Task Gates' },
  { group: 'Documents', key: PERM.documents.read, displayName: 'Read Documents' },
  { group: 'Documents', key: PERM.documents.upload, displayName: 'Upload Documents' },
  { group: 'Documents', key: PERM.documents.update, displayName: 'Update Documents' },
  { group: 'Documents', key: PERM.documents.delete, displayName: 'Delete Documents' },
  { group: 'Approvals', key: PERM.approvals.read, displayName: 'Read Approvals' },
  { group: 'Approvals', key: PERM.approvals.decide, displayName: 'Decide Approval' },
  { group: 'File Templates', key: PERM.fileTemplates.read, displayName: 'Read File Templates' },
  { group: 'File Templates', key: PERM.fileTemplates.manage, displayName: 'Manage File Templates' },
  { group: 'Activities', key: PERM.activities.read, displayName: 'Read Activity Feed' },
  { group: 'Audit', key: PERM.audit.read, displayName: 'Read Audit Log' },
  { group: 'Audit', key: PERM.audit.viewOwn, displayName: 'View Own Activity' },
  {
    group: 'Notifications',
    key: PERM.notifications.viewOwn,
    displayName: 'View Own Notifications',
  },
  { group: 'Finance', key: PERM.finance.read, displayName: 'Read Finance' },
  { group: 'Finance', key: PERM.finance.manageCostCategory, displayName: 'Manage Cost Categories' },
  { group: 'Finance', key: PERM.finance.manageBudget, displayName: 'Manage Budget' },
  { group: 'Finance', key: PERM.finance.recordPayment, displayName: 'Record Payment' },
  { group: 'Finance', key: PERM.finance.reversePayment, displayName: 'Reverse Payment' },
  { group: 'Finance', key: PERM.finance.manageInvoice, displayName: 'Manage Invoice' },
  { group: 'Finance', key: PERM.finance.cancelInvoice, displayName: 'Cancel Invoice' },
  { group: 'Finance', key: PERM.finance.manageVariation, displayName: 'Manage Variation' },
  { group: 'Finance', key: PERM.finance.approveVariation, displayName: 'Approve Variation' },
  { group: 'Finance', key: PERM.finance.signVariation, displayName: 'Sign Variation' },
  { group: 'Finance', key: PERM.finance.applyVariation, displayName: 'Apply Variation' },
  { group: 'Finance', key: PERM.finance.generateBoq, displayName: 'Generate BOQ' },
  { group: 'DMS', key: PERM.dms.taskDetail.view, displayName: 'View DMS Task Detail' },
  // CRM. A key present in PERM but absent here silently fails to appear in the Roles
  // matrix — both lists are required.
  { group: 'CRM', key: PERM.crm.portal, displayName: 'Client Portal' },
  { group: 'CRM · Leads', key: PERM.crm.leads.read, displayName: 'Read Leads' },
  { group: 'CRM · Leads', key: PERM.crm.leads.create, displayName: 'Create Leads' },
  { group: 'CRM · Leads', key: PERM.crm.leads.update, displayName: 'Update Leads' },
  { group: 'CRM · Leads', key: PERM.crm.leads.changeStatus, displayName: 'Change Lead Status' },
  { group: 'CRM · Leads', key: PERM.crm.leads.convert, displayName: 'Convert Lead' },
  { group: 'CRM · Contacts', key: PERM.crm.contacts.read, displayName: 'Read Contacts' },
  { group: 'CRM · Contacts', key: PERM.crm.contacts.create, displayName: 'Create Contacts' },
  { group: 'CRM · Contacts', key: PERM.crm.contacts.update, displayName: 'Update Contacts' },
  {
    group: 'CRM · Contacts',
    key: PERM.crm.contacts.setPrimary,
    displayName: 'Set Primary Contact',
  },
  { group: 'CRM · Periods', key: PERM.crm.periods.read, displayName: 'Read Requirement Periods' },
  { group: 'CRM · Periods', key: PERM.crm.periods.open, displayName: 'Open Period' },
  { group: 'CRM · Periods', key: PERM.crm.periods.extend, displayName: 'Extend Period' },
  { group: 'CRM · Periods', key: PERM.crm.periods.close, displayName: 'Close Period' },
  { group: 'CRM · Items', key: PERM.crm.items.read, displayName: 'Read Requirement Items' },
  { group: 'CRM · Items', key: PERM.crm.items.create, displayName: 'Create Requirement Items' },
  { group: 'CRM · Items', key: PERM.crm.items.update, displayName: 'Update Requirement Items' },
  { group: 'CRM · Items', key: PERM.crm.items.send, displayName: 'Send Requirement Items' },
  {
    group: 'CRM · Items',
    key: PERM.crm.items.supersede,
    displayName: 'Supersede Requirement Items',
  },
  { group: 'CRM · Notes', key: PERM.crm.notes.read, displayName: 'Read Notes' },
  { group: 'CRM · Notes', key: PERM.crm.notes.create, displayName: 'Create Notes' },
  { group: 'CRM · Notes', key: PERM.crm.notes.update, displayName: 'Update Notes' },
  { group: 'CRM · Notes', key: PERM.crm.notes.delete, displayName: 'Delete Notes' },
  {
    group: 'CRM · Design Profile',
    key: PERM.crm.designProfile.read,
    displayName: 'View Design Profile',
  },
  { group: 'CRM · Meetings', key: PERM.crm.meetings.read, displayName: 'Read Meetings' },
  { group: 'CRM · Meetings', key: PERM.crm.meetings.schedule, displayName: 'Schedule Meeting' },
  { group: 'CRM · Meetings', key: PERM.crm.meetings.respondSlot, displayName: 'Respond to Slot' },
  { group: 'CRM · Meetings', key: PERM.crm.meetings.reschedule, displayName: 'Reschedule Meeting' },
  { group: 'CRM · Meetings', key: PERM.crm.meetings.cancel, displayName: 'Cancel Meeting' },
  { group: 'CRM · Meetings', key: PERM.crm.meetings.complete, displayName: 'Complete Meeting' },
  { group: 'CRM · Meetings', key: PERM.crm.meetings.markNoShow, displayName: 'Mark No-show' },
  { group: 'CRM · Meetings', key: PERM.crm.meetings.viewOwn, displayName: 'View Own Meetings' },
  {
    group: 'CRM · Meetings',
    key: PERM.crm.meetings.requestOwn,
    displayName: 'Request Own Meeting',
  },
  {
    group: 'CRM · Meetings',
    key: PERM.crm.meetings.respondOwn,
    displayName: 'Respond to Own Meeting',
  },
  { group: 'CRM · Artifacts', key: PERM.crm.artifacts.read, displayName: 'Read Artifacts' },
  { group: 'CRM · Artifacts', key: PERM.crm.artifacts.manage, displayName: 'Manage Artifacts' },
  { group: 'CRM · Briefs', key: PERM.crm.briefs.read, displayName: 'Read Design Brief' },
  { group: 'CRM · Briefs', key: PERM.crm.briefs.manage, displayName: 'Manage Design Brief' },
  { group: 'CRM · Briefs', key: PERM.crm.briefs.send, displayName: 'Send Design Brief' },
  { group: 'CRM · Briefs', key: PERM.crm.briefs.viewOwn, displayName: 'View Own Brief' },
  { group: 'CRM · Space Types', key: PERM.crm.spaceTypes.read, displayName: 'Read Space Types' },
  {
    group: 'CRM · Space Types',
    key: PERM.crm.spaceTypes.manage,
    displayName: 'Manage Space Types',
  },
  { group: 'CRM · Catalog', key: PERM.crm.catalog.read, displayName: 'Read Catalog' },
  { group: 'CRM · Catalog', key: PERM.crm.catalog.manage, displayName: 'Manage Catalog' },
  { group: 'CRM · Spaces', key: PERM.crm.spaces.read, displayName: 'Read Spaces' },
  { group: 'CRM · Spaces', key: PERM.crm.spaces.manage, displayName: 'Manage Spaces' },
  { group: 'CRM · Approvals', key: PERM.crm.approvals.viewOwn, displayName: 'View Own Approvals' },
  {
    group: 'CRM · Approvals',
    key: PERM.crm.approvals.decideOwn,
    displayName: 'Decide Own Approval',
  },
  { group: 'Requirements', key: PERM.requirements.viewOwn, displayName: 'View Own Requirements' },
  {
    group: 'Requirements',
    key: PERM.requirements.submitOwn,
    displayName: 'Submit Own Requirement',
  },
  { group: 'Portal', key: PERM.portal.profileViewOwn, displayName: 'View Own Portal Profile' },
];

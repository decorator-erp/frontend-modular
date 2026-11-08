export interface NavItem {
  label: string;
  icon: string;
  route: string;
  capability?: string;
  /**
   * crmp P1-B: shown only when the condition holds — `accessGrants`: the caller has an Active or
   * Upcoming project access grant (`GET /api/me/access-grants` returns rows).
   */
  when?: 'accessGrants';
  /**
   * crmp P1-B: also shown, without `capability` in the token, to a caller holding an Active
   * whole-project grant on this area (the route's ProjectGrantGuard admits them).
   */
  grantArea?: 'Sites';
}

export interface NavSection {
  title: string;
  items: NavItem[];
}

export const NAV_SECTIONS: NavSection[] = [
  {
    title: 'Operations',
    items: [
      { label: 'Dashboard', icon: 'home', route: '/dashboard' },
      { label: 'Projects', icon: 'briefcase', route: '/projects' },
      // crmp P1-B: the caller's temporary project access; only when there is some.
      {
        label: 'Shared with me',
        icon: 'users',
        route: '/projects/shared-with-me',
        when: 'accessGrants',
      },
      { label: 'Leads', icon: 'users', route: '/crm/leads', capability: 'crm.leads.read' },
      // sites (NEW-FEATURE-1, spec §6 edit 3): the icon set has no 'ruler' — 'folder' instead.
      {
        label: 'Site surveys',
        icon: 'folder',
        route: '/sites',
        capability: 'sites.read',
        grantArea: 'Sites',
      },
    ],
  },
  {
    title: 'Admin',
    items: [
      { label: 'Employees', icon: 'users', route: '/employees', capability: 'employees.read' },
      { label: 'Clients', icon: 'user', route: '/clients', capability: 'clients.read' },
      {
        label: 'Departments',
        icon: 'inbox',
        route: '/departments',
        capability: 'departments.read',
      },
      { label: 'Roles', icon: 'lock', route: '/roles', capability: 'roles.read' },
      {
        label: 'Permissions',
        icon: 'settings',
        route: '/permissions',
        capability: 'permissions.manage',
      },
      {
        label: 'Catalog',
        icon: 'file-text',
        route: '/admin/catalog',
        // Matches the route's own gate (app.routes.ts) — `manage`, not `read`. `read` is
        // also held by the Client role; the office nav must not offer an editor to a
        // viewer who will 403 on every button inside it.
        capability: 'crm.catalog.manage',
      },
      { label: 'Finance', icon: 'briefcase', route: '/finance' },
      { label: 'Audit log', icon: 'file-text', route: '/audit', capability: 'audit.read' },
      {
        label: 'Survey definitions',
        icon: 'settings',
        route: '/admin/site-definitions',
        capability: 'sites.definitions.manage',
      },
    ],
  },
  {
    title: 'Library',
    items: [
      { label: 'Stage templates', icon: 'folder', route: '/library/stage-templates' },
      // Sync F3: the file template library (FileTemplateEndpoints.cs).
      {
        label: 'File templates',
        icon: 'file-text',
        route: '/library/file-templates',
        capability: 'file_templates.read',
      },
      { label: 'BOQ catalog', icon: 'file-text', route: '/library/boq-catalog' },
      { label: 'Materials', icon: 'folder', route: '/library/materials' },
    ],
  },
];

/** Flat list for backwards compatibility. */
export const NAV_ITEMS: NavItem[] = NAV_SECTIONS.flatMap((s) => s.items);

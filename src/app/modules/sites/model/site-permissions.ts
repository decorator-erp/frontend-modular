/**
 * sites: the claim strings of dms `Sites.Contracts/SitesPermissions.cs` (`:31-53`). The platform `PERM`
 * catalog has no `sites` group and the spec allows no edit to it (§6), so the module keeps its own
 * (DEVIATION-20). `project.read_all` is the projects claim the self-approval rule checks.
 */
export const SITE_PERM = {
  read: 'sites.read',
  create: 'sites.create',
  update: 'sites.update',
  submit: 'sites.submit',
  approve: 'sites.approve',
  delete: 'sites.delete',
  definitionsManage: 'sites.definitions.manage',
  projectReadAll: 'project.read_all',
} as const;

import { ALL_PERMISSIONS, PERM } from './permissions.constants';

/** Recursively collect every string leaf of the PERM tree. */
function collectPermStrings(node: unknown, out: string[] = []): string[] {
  if (typeof node === 'string') {
    out.push(node);
  } else if (node && typeof node === 'object') {
    for (const value of Object.values(node)) collectPermStrings(value, out);
  }
  return out;
}

describe('PERM catalog', () => {
  it('holds only live backend claim strings (lowercase, dotted — no PascalCase doc spelling)', () => {
    // The doc-vs-claim translation shim was removed; `can()` checks these strings
    // verbatim, so any PascalCase leftover would silently never match a backend claim.
    for (const perm of collectPermStrings(PERM)) {
      expect(perm).toMatch(/^[a-z][a-z0-9_.]*$/);
    }
  });

  it('has no portal.profile.view_own — the backend declares no such claim (009b X-7, FINDING-4-8)', () => {
    expect(collectPermStrings(PERM)).not.toContain('portal.profile.view_own');
    expect(Object.keys(PERM)).not.toContain('portal');
  });

  it('adds neither crm.notes.manage_all nor crm.clients.read_all (009b D-e)', () => {
    expect(collectPermStrings(PERM)).not.toContain('crm.notes.manage_all');
    expect(collectPermStrings(PERM)).not.toContain('crm.clients.read_all');
  });

  it('has the scope-of-work group (008b #11, ProjectsPermissions.Scope)', () => {
    expect(PERM.scope).toEqual({
      read: 'scope.read',
      manage: 'scope.manage',
      confirm: 'scope.confirm',
    });
  });

  it('has the client portal visibility codes (crmp P2-B, CrmPermissions.PortalVisibility)', () => {
    expect(PERM.crm.portalVisibility).toEqual({
      manage: 'crm.portal.manage',
      filesViewOwn: 'crm.portal.files.view_own',
      progressViewOwn: 'crm.portal.progress.view_own',
    });
  });

  it('exposes the UI-only DMS task-detail gate in its live claim spelling', () => {
    expect(PERM.dms.taskDetail.view).toBe('dms.task_detail.view');
  });
});

describe('ALL_PERMISSIONS matrix', () => {
  it('lists the DMS gate', () => {
    expect(ALL_PERMISSIONS.some((p) => p.key === PERM.dms.taskDetail.view)).toBe(true);
  });

  it('lists the three scope-of-work permissions (008b #11)', () => {
    const keys = ALL_PERMISSIONS.map((p) => p.key);
    expect(keys).toEqual(expect.arrayContaining(['scope.read', 'scope.manage', 'scope.confirm']));
  });

  it('has no duplicate keys', () => {
    const keys = ALL_PERMISSIONS.map((p) => p.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('only lists keys that exist in the PERM catalog', () => {
    const known = new Set(collectPermStrings(PERM));
    for (const { key } of ALL_PERMISSIONS) {
      expect(known.has(key)).toBe(true);
    }
  });
});

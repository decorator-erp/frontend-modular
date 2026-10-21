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

  it('exposes the UI-only DMS task-detail gate in its live claim spelling', () => {
    expect(PERM.dms.taskDetail.view).toBe('dms.task_detail.view');
  });
});

describe('ALL_PERMISSIONS matrix', () => {
  it('lists the DMS gate', () => {
    expect(ALL_PERMISSIONS.some((p) => p.key === PERM.dms.taskDetail.view)).toBe(true);
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

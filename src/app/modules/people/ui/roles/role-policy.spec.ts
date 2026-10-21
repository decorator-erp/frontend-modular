import { describe, expect, it } from 'vitest';
import { isFullAccessRole, isSystemRole } from './role-policy';

/** 006b-1 #6: mirrors backend `DefaultRoles.All` / `FullAccessRoles`, case-insensitively. */
describe('role policy (006b-1 #6)', () => {
  it.each(['admin', 'Manager', 'EMPLOYEE', 'client'])('%s is a system role', (name) => {
    expect(isSystemRole(name)).toBe(true);
  });

  it.each(['Project lead', 'designer', '', null])('%s is not a system role', (name) => {
    expect(isSystemRole(name)).toBe(false);
  });

  it('only admin and manager are full access', () => {
    expect(isFullAccessRole('Admin')).toBe(true);
    expect(isFullAccessRole('manager')).toBe(true);
    expect(isFullAccessRole('employee')).toBe(false);
    expect(isFullAccessRole('client')).toBe(false);
  });
});

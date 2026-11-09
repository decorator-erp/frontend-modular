import { describe, expect, it } from 'vitest';
import {
  ERROR_MESSAGES,
  ERROR_MESSAGES_AR,
  SCOPE_ERROR_CODES,
  friendlyMessage,
} from './error-catalog';

/** 002b A5: the authentications family against backend remediation v3 (`AuthErrors.cs`). */
describe('ERROR_MESSAGES — authentications (002b A5)', () => {
  it.each([
    ['authentications.StaleToken', 'Your session is no longer valid. Please sign in again.'],
    ['authentications.LockedOut', 'Too many attempts. Try again in 15 minutes.'],
    ['authentications.RefreshTokenReused', 'Your session has ended. Please sign in again.'],
  ])('carries %s', (code, message) => {
    expect(ERROR_MESSAGES[code]).toBe(message);
    expect(friendlyMessage(code, 'fallback')).toBe(message);
  });

  it('no longer carries authentications.UserNotActive (deleted in the backend)', () => {
    expect('authentications.UserNotActive' in ERROR_MESSAGES).toBe(false);
  });
});

/** 006b-1 #5: the permissions and roles families against backend remediation v3. */
describe('ERROR_MESSAGES — permissions and roles (006b-1 #5)', () => {
  it.each([
    'permissions.CannotDelegate',
    'permissions.SelfModification',
    'permissions.LastHolder',
    'roles.SystemRole',
    'roles.FullAccessLocked',
    'roles.RoleInUse',
  ])('carries %s', (code) => {
    expect(ERROR_MESSAGES[code]).toBeTruthy();
    expect(friendlyMessage(code, 'fallback')).not.toBe('fallback');
  });

  it('tells the user what to do on RoleInUse and SelfModification', () => {
    expect(ERROR_MESSAGES['roles.RoleInUse']).toContain('Remove its members first');
    expect(ERROR_MESSAGES['permissions.SelfModification']).toContain('Ask another administrator');
  });
});

/** 006b-1 #25: codes deleted from backend v3 (Phase 5). */
describe('ERROR_MESSAGES — dead permissions/roles keys (006b-1 #25)', () => {
  it.each(['permissions.NotFoundForTarget', 'roles.UserNotInRole'])(
    'no longer carries %s',
    (code) => {
      expect(code in ERROR_MESSAGES).toBe(false);
    },
  );
});

/** 006b-2 #28: the people-data families against backend remediation v3. */
describe('ERROR_MESSAGES — employees, departments, users (006b-2 #28)', () => {
  it.each([
    'employees.Inactive',
    'employees.AlreadyInAnotherDepartment',
    'employees.EndDateBeforeHireDate',
    'employees.WeakPassword',
    'departments.RemoveHeadFirst',
    'users.DuplicatedEmail',
  ])('carries %s', (code) => {
    expect(ERROR_MESSAGES[code]).toBeTruthy();
  });

  it('RemoveHeadFirst tells the user to unassign the head first', () => {
    expect(ERROR_MESSAGES['departments.RemoveHeadFirst']).toContain('Unassign them as head first');
  });

  it('no longer carries departments.NoEmployeesToMove (deleted in the backend)', () => {
    expect('departments.NoEmployeesToMove' in ERROR_MESSAGES).toBe(false);
  });
});

/** FINDING-7-10: the generic validation code has an EN and an AR message. */
describe('ERROR_MESSAGES — Validation.General (sow FINDING-7-10)', () => {
  it('carries an English and an Arabic message', () => {
    expect(friendlyMessage('Validation.General', 'fb', 'en')).toBe(
      'Some values are invalid. Check the highlighted fields.',
    );
    expect(friendlyMessage('Validation.General', 'fb', 'ar')).toBe(
      'بعض القيم غير صحيحة. راجع الحقول المحدَّدة.',
    );
  });
});

describe('SCOPE_ERROR_CODES (crm-prod FINDING-P2-9)', () => {
  it('names only codes with an EN and an AR message', () => {
    const codes = Object.values(SCOPE_ERROR_CODES);
    expect(codes).toHaveLength(7); // LC-1 added tooManyItems (the convert wizard checks it before creating)
    for (const code of codes) {
      expect(code.startsWith('projects.scope.')).toBe(true);
      expect(ERROR_MESSAGES[code], code).toBeTruthy();
      expect(ERROR_MESSAGES_AR[code], code).toBeTruthy();
    }
  });
  // BF-1 (dms PR #26): Documents writes below Editor answer 403 project_documents.InsufficientLevel.
  it('project_documents.InsufficientLevel reads in EN and AR', () => {
    expect(friendlyMessage('project_documents.InsufficientLevel', 'fb', 'en')).toBe(
      'Your access level on this project does not allow this action.',
    );
    expect(friendlyMessage('project_documents.InsufficientLevel', 'fb', 'ar')).toBe(
      'مستوى صلاحيتك على هذا المشروع لا يسمح بهذا الإجراء.',
    );
  });
});

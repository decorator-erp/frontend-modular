import { describe, expect, it } from 'vitest';
import { domainErrorKey } from './domain-error-key';

describe('domainErrorKey — spaces (009b #29)', () => {
  it('maps the live crm.spaces.DuplicateName to space.nameTaken', () => {
    expect(domainErrorKey('crm.spaces.DuplicateName', 'space.saveFailed')).toBe('space.nameTaken');
  });

  it('no longer maps the dead crm.spaces.NameTaken', () => {
    expect(domainErrorKey('crm.spaces.NameTaken', 'space.saveFailed')).toBe('space.saveFailed');
  });
});

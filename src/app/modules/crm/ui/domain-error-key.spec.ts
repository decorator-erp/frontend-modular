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

describe('domainErrorKey — catalog (009b #40)', () => {
  it('maps the live crm.catalog.CyclicMove to cat.cycleDetected', () => {
    expect(domainErrorKey('crm.catalog.CyclicMove', 'cat.moveFailed')).toBe('cat.cycleDetected');
  });

  it('no longer maps the dead crm.catalog.CycleDetected', () => {
    expect(domainErrorKey('crm.catalog.CycleDetected', 'cat.moveFailed')).toBe('cat.moveFailed');
  });
});

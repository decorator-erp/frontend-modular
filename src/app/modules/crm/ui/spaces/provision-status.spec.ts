import { describe, expect, it } from 'vitest';
import { CrmProvisionStatus } from '../../model/crm-enums';
import {
  PROVISION_STATUSES,
  nextProvisionStatus,
  provisionStatusKey,
  provisionStatusTone,
} from './provision-status';

describe('nextProvisionStatus', () => {
  it('cycles ToBuy → ClientHas → Reuse → NotApplicable and wraps back', () => {
    expect(nextProvisionStatus(CrmProvisionStatus.ToBuy)).toBe(CrmProvisionStatus.ClientHas);
    expect(nextProvisionStatus(CrmProvisionStatus.ClientHas)).toBe(CrmProvisionStatus.Reuse);
    expect(nextProvisionStatus(CrmProvisionStatus.Reuse)).toBe(CrmProvisionStatus.NotApplicable);
    expect(nextProvisionStatus(CrmProvisionStatus.NotApplicable)).toBe(CrmProvisionStatus.ToBuy);
  });

  it('returns to the starting status after a full lap — the board badge must not dead-end', () => {
    let status = CrmProvisionStatus.ToBuy;
    for (let i = 0; i < PROVISION_STATUSES.length; i++) status = nextProvisionStatus(status);
    expect(status).toBe(CrmProvisionStatus.ToBuy);
  });

  it('reaches every status exactly once per lap', () => {
    const seen = new Set<CrmProvisionStatus>();
    let status = CrmProvisionStatus.ToBuy;
    for (let i = 0; i < PROVISION_STATUSES.length; i++) {
      seen.add(status);
      status = nextProvisionStatus(status);
    }
    expect(seen.size).toBe(PROVISION_STATUSES.length);
  });
});

describe('provisionStatusKey / provisionStatusTone', () => {
  it('maps every status to a distinct label key', () => {
    const keys = PROVISION_STATUSES.map(provisionStatusKey);
    expect(new Set(keys).size).toBe(PROVISION_STATUSES.length);
  });

  it('gives ToBuy a warning tone and NotApplicable a neutral one', () => {
    // ToBuy is the only status that implies outstanding spend.
    expect(provisionStatusTone(CrmProvisionStatus.ToBuy)).toBe('warning');
    expect(provisionStatusTone(CrmProvisionStatus.NotApplicable)).toBe('neutral');
  });
});

import { describe, expect, it } from 'vitest';
import { EN } from '@platform/i18n/catalog/en';
import { AR } from '@platform/i18n/catalog/ar';
import { ERROR_MESSAGES, ERROR_MESSAGES_AR } from '@platform/errors/error-catalog';

/**
 * FINDING-5-2: after 009b #19 a client's requested slot has no hold timestamp — it stays
 * Proposed until the office answers it, and lapses at its start
 * (`Crm.Domain/CrmMeetingSlot.cs:66-82`). The Held card must not promise a 24-hour hold.
 */
describe('client scheduler copy (FINDING-5-2)', () => {
  it('the Held card names no 24-hour hold, in EN or AR', () => {
    expect(EN['sched.csHeldB']).not.toMatch(/24/);
    expect(AR['sched.csHeldB']).not.toMatch(/24/);
  });

  it('the Held card says the request lapses at the slot start', () => {
    expect(EN['sched.csHeldB']).toMatch(/before the slot starts/);
    expect(AR['sched.csHeldB']).toMatch(/قبل بدء الموعد/);
  });

  it.each(['crm.meetings.SlotNotProposed', 'crm.meetings.AlreadyStarted'])(
    '%s has EN and AR copy',
    (code) => {
      expect(ERROR_MESSAGES[code]).toBeTruthy();
      expect(ERROR_MESSAGES_AR[code]).toBeTruthy();
    },
  );
});

import { describe, expect, it } from 'vitest';
import { ApprovalState } from '../../model/crm-enums';
import { EN } from '@platform/i18n/catalog/en';
import { CLOSED_CHIP, SUPERSEDED_CHIP, isLocked, isUnconfirmed, trustChip } from './trust-chip';

/**
 * `trustChip()` is a pure function that encodes the trust rule visually. It is
 * exactly the kind of thing that is SILENTLY wrong when broken — a chip is still a
 * chip, and manual QA reads "green" as "fine" — so it is tested rather than trusted.
 *
 * SC-004: one definition, zero per-screen variants.
 */
describe('trustChip()', () => {
  const EMPLOYEE = false;
  const CLIENT = true;

  it('maps every employee-authored state', () => {
    expect(trustChip(ApprovalState.Draft, EMPLOYEE)).toEqual({
      tone: 'neutral',
      key: 'trust.draft',
    });
    expect(trustChip(ApprovalState.PendingApproval, EMPLOYEE)).toEqual({
      tone: 'pending',
      key: 'trust.pending',
    });
    expect(trustChip(ApprovalState.Approved, EMPLOYEE)).toEqual({
      tone: 'success',
      key: 'trust.approved',
    });
    expect(trustChip(ApprovalState.Rejected, EMPLOYEE)).toEqual({
      tone: 'error',
      key: 'trust.rejected',
    });
    expect(trustChip(ApprovalState.NotRequired, EMPLOYEE)).toEqual({
      tone: 'success',
      key: 'trust.trusted',
    });
  });

  it('covers the superseded and closed chips', () => {
    expect(SUPERSEDED_CHIP).toEqual({ tone: 'neutral', key: 'trust.superseded' });
    expect(CLOSED_CHIP).toEqual({ tone: 'neutral', key: 'trust.closed' });
  });

  // The invariant that IS the trust rule made visual. Client-written content is born
  // trusted and must look no less final than something the client approved. A future
  // "helpful" differentiation of the two greens breaks the rule and this test.
  it('gives Approved and Trusted THE SAME green — the collapse is the point', () => {
    const approved = trustChip(ApprovalState.Approved, EMPLOYEE);
    const trusted = trustChip(ApprovalState.NotRequired, CLIENT);

    expect(approved.tone).toBe('success');
    expect(trusted.tone).toBe('success');
    expect(approved.tone).toBe(trusted.tone);
    // Same tone, different words — the label still tells them apart (never colour alone).
    expect(approved.key).not.toBe(trusted.key);
  });

  // FR-012 — the one asymmetry. A client-authored artifact is Trusted on arrival and
  // can NEVER render Draft or Pending, whatever state the wire happens to carry.
  it('never yields Draft or Pending for a client-authored artifact (FR-012)', () => {
    const states = [
      ApprovalState.Draft,
      ApprovalState.PendingApproval,
      ApprovalState.Approved,
      ApprovalState.Rejected,
      ApprovalState.NotRequired,
    ];

    for (const state of states) {
      const chip = trustChip(state, CLIENT);
      expect(chip.key, `client-authored ${ApprovalState[state]} must not be draft/pending`).toBe(
        'trust.trusted',
      );
      expect(chip.tone).toBe('success');
    }
  });

  // The tone-name collision the contract warns about: StatusBadgeTone spells red
  // `error`; BadgeTone (pera-badge) spells it `danger`. Binding the wrong one to
  // pera-status-badge silently drops the tint.
  it('returns StatusBadgeTone spelling — `error`, never `danger`', () => {
    expect(trustChip(ApprovalState.Rejected, EMPLOYEE).tone).toBe('error');
  });

  it('resolves every chip key against the catalog', () => {
    const states = [
      ApprovalState.Draft,
      ApprovalState.PendingApproval,
      ApprovalState.Approved,
      ApprovalState.Rejected,
      ApprovalState.NotRequired,
    ];
    const keys = [
      ...states.map((s) => trustChip(s, EMPLOYEE).key),
      trustChip(ApprovalState.NotRequired, CLIENT).key,
      SUPERSEDED_CHIP.key,
      CLOSED_CHIP.key,
    ];

    for (const key of keys) {
      expect(EN[key], `catalog is missing ${key}`).toBeTruthy();
    }
  });
});

describe('isLocked()', () => {
  // FR-010 / SC-005 — Approved means locked FOREVER. No edit affordance may render
  // anywhere; the only offered path is to append a superseding artifact.
  it('locks Approved, and locks a client-authored artifact on arrival', () => {
    expect(isLocked(ApprovalState.Approved, false)).toBe(true);
    expect(isLocked(ApprovalState.NotRequired, false)).toBe(true);
    expect(isLocked(ApprovalState.Draft, true)).toBe(true);
  });

  it('leaves an employee-authored Draft, Pending or Rejected artifact editable', () => {
    expect(isLocked(ApprovalState.Draft, false)).toBe(false);
    expect(isLocked(ApprovalState.PendingApproval, false)).toBe(false);
    expect(isLocked(ApprovalState.Rejected, false)).toBe(false);
  });
});

describe('isUnconfirmed()', () => {
  // FR-013 — the watermark follows Draft and Pending onto every screen a designer
  // could reach.
  it('marks employee-authored Draft and Pending', () => {
    expect(isUnconfirmed(ApprovalState.Draft, false)).toBe(true);
    expect(isUnconfirmed(ApprovalState.PendingApproval, false)).toBe(true);
  });

  it('never marks client-authored content — it is trusted on arrival', () => {
    expect(isUnconfirmed(ApprovalState.Draft, true)).toBe(false);
    expect(isUnconfirmed(ApprovalState.PendingApproval, true)).toBe(false);
  });

  it('never marks Approved or Rejected', () => {
    expect(isUnconfirmed(ApprovalState.Approved, false)).toBe(false);
    expect(isUnconfirmed(ApprovalState.Rejected, false)).toBe(false);
  });
});

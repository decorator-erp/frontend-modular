import { ApprovalState } from '../../model/crm-enums';
import type { CatalogKey } from '@platform/i18n/catalog/en';
import type { StatusBadgeTone } from '@ds';

/**
 * The trust-rule chip vocabulary — defined ONCE, identical on every screen (SC-004).
 *
 * `pera-status-badge`'s existing six tones cover the whole vocabulary; no new tone is
 * needed. Every chip pairs a colored dot with a text label, so the constitution's
 * "status is never colour-only" rule holds for free (`dot = true` by default).
 *
 * ⚠️ Returns `StatusBadgeTone` (which spells the red tone `error`), NOT `BadgeTone`
 * (which spells it `danger`). Bind this to `<pera-status-badge>`, never `<pera-badge>`.
 *
 * ⚠️ Lives in `design-system`, not `shared/enums/crm` as tasks.md sketches. The
 * `shared/enums/finance` precedent it points at is exactly the frozen `shared → ds`
 * boundary debt (each of those files imports `BadgeTone` from `@ds` and carries a
 * suppression). Copying it would add a 68th suppression and fail the zero-growth gate.
 * `ds → core` is legal, so the mapping sits here with the three CSS treatments it
 * belongs beside — which is also what FR-004 asks for.
 */
export interface TrustChip {
  readonly tone: StatusBadgeTone;
  readonly key: CatalogKey;
}

/**
 * Map an artifact's approval state to its chip.
 *
 * **Approved and Trusted both map to `success` — the same green, deliberately.** That
 * collapse IS the trust rule made visual: client-written content is born trusted, and
 * it should look no less final than something the client approved. Do not "helpfully"
 * differentiate them.
 *
 * A client-authored artifact is Trusted on arrival (`ApprovalState.NotRequired`) and
 * can never render Draft or Pending (FR-012) — hence the early return.
 */
export function trustChip(state: ApprovalState, authoredByClient: boolean): TrustChip {
  if (authoredByClient) {
    // The one asymmetry in the trust rule. The server backs this up: the design-profile
    // handler treats NotRequired exactly like Approved.
    return { tone: 'success', key: 'trust.trusted' };
  }

  switch (state) {
    case ApprovalState.Draft:
      return { tone: 'neutral', key: 'trust.draft' };
    case ApprovalState.PendingApproval:
      return { tone: 'pending', key: 'trust.pending' };
    case ApprovalState.Approved:
      return { tone: 'success', key: 'trust.approved' };
    case ApprovalState.Rejected:
      return { tone: 'error', key: 'trust.rejected' };
    case ApprovalState.NotRequired:
      // NotRequired without a client author still means "no approval needed" — trusted.
      return { tone: 'success', key: 'trust.trusted' };
  }
}

/** A superseded artifact keeps its own chip — slate, with the trail retained (FR-011). */
export const SUPERSEDED_CHIP: TrustChip = { tone: 'neutral', key: 'trust.superseded' };

/** A closed requirement period. */
export const CLOSED_CHIP: TrustChip = { tone: 'neutral', key: 'trust.closed' };

/**
 * True when the artifact is locked forever (FR-010, SC-005). A locked artifact renders
 * NO edit affordance anywhere — not disabled, **absent** — and its attachment set is
 * frozen (FR-033). The only offered path is "New version…".
 */
export function isLocked(state: ApprovalState, authoredByClient: boolean): boolean {
  return (
    state === ApprovalState.Approved || state === ApprovalState.NotRequired || authoredByClient
  );
}

/**
 * True when the artifact is untrusted and must carry the unconfirmed treatment on every
 * screen a designer could reach (FR-013).
 */
export function isUnconfirmed(state: ApprovalState, authoredByClient: boolean): boolean {
  if (authoredByClient) return false;
  return state === ApprovalState.Draft || state === ApprovalState.PendingApproval;
}

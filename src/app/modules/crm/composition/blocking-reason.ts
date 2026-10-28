import { CatalogService } from '@platform/i18n/catalog.service';
import { ApprovalState } from '../model/crm-enums';
import type { CrmTaskBlock } from '../model';

/**
 * The client-side blocking reason (T093, FR-027, SC-006) — composed from the crm
 * block's FACTS (`briefStatus`, `entryPending`, `itemPending`) and catalog strings.
 * **The server must never compose this** — a server-composed sentence could only ever
 * be English and would violate FR-037.
 *
 * `null` ⇒ nothing blocks Complete.
 *
 * 🟡 **Dependency 3 shortfall** — `briefPendingSinceUtc` / `oldestPendingSinceUtc` do
 * not exist on `CrmTaskBlock` and are not derivable client-side (the counts come from
 * an aggregate `GroupBy`; no per-row status-transition timestamp is projected). Every
 * catalog key here carries a `{since}` slot so the fact can land later as data, not a
 * redesign — today it always resolves empty.
 */
export function blockingReason(crm: CrmTaskBlock, catalog: CatalogService): string | null {
  const reasons: string[] = [];

  if (crm.briefStatus !== null && crm.briefStatus !== ApprovalState.Approved) {
    reasons.push(catalog.t('task.blocked.briefPending', { since: '' }));
  }
  if (crm.entryPending > 0) {
    reasons.push(catalog.t('task.blocked.entries', { count: crm.entryPending, since: '' }));
  }
  if (crm.itemPending > 0) {
    reasons.push(catalog.t('task.blocked.items', { count: crm.itemPending, since: '' }));
  }

  if (!reasons.length) return null;
  return `${catalog.t('task.blocked.title')} ${reasons.join(' · ')}`;
}

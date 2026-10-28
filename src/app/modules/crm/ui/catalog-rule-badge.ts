import type { CatalogKey } from '@platform/i18n/catalog/en';
import { CatalogSelectionMode } from '../model/crm-enums';
import type { StatusBadgeTone } from '@ds';

export interface BranchRuleBadge {
  readonly tone: StatusBadgeTone;
  readonly labelKey: CatalogKey;
}

/**
 * The selection-mode badge for a branch, or `null` when it carries no rule.
 *
 * Shared by the catalog admin and the storefront picker so the two surfaces cannot drift
 * — a Single branch must look the same wherever it is shown, and the picker in particular
 * needs it up front (otherwise the rule is only discovered via a
 * `crm.catalog.SingleRuleViolated` 409 after the user has already picked).
 *
 * Typed structurally (`{ selectionMode }`) rather than against `CatalogCategory` — it is
 * the ONE field this reads, so the admin and the storefront can each pass their own
 * category-shaped value without either needing to import the other's type.
 */
export function branchRuleBadge(node: {
  selectionMode: CatalogSelectionMode;
}): BranchRuleBadge | null {
  if (node.selectionMode === CatalogSelectionMode.Single) {
    return { tone: 'info', labelKey: 'cat.ruleSingle' };
  }
  if (node.selectionMode === CatalogSelectionMode.Multi) {
    return { tone: 'pending', labelKey: 'cat.ruleMulti' };
  }
  return null;
}

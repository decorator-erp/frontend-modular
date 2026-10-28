import type { CatalogKey } from '@platform/i18n/catalog/en';

/**
 * Map a backend domain error code to a TRANSLATED catalog key.
 *
 * Why not `friendly(parsed)` from `@core/http/error-handler.service`? That resolves through
 * `ERROR_MESSAGES` (`core/errors/error-catalog.ts`), which is English-only — surfacing it in
 * a toast would put an English literal on an Arabic screen. This keeps the *specificity* of
 * the server code (a 409 on save is `CodeTaken` vs `CycleDetected` — materially different
 * advice) while staying bilingual.
 *
 * Only the codes these flows can actually raise are listed; anything else falls back to the
 * caller's generic key.
 */
const CODE_TO_KEY: Readonly<Record<string, CatalogKey>> = {
  // Catalog
  'crm.catalog.CodeTaken': 'cat.codeTaken',
  'crm.catalog.CycleDetected': 'cat.cycleDetected',
  'crm.catalog.NodeInUse': 'cat.nodeInUse',
  'crm.catalog.LeafCarriesBranchRule': 'cat.leafRule',
  'crm.catalog.NotABranch': 'cat.notABranch',
  // Spaces + board
  'crm.spaces.NameTaken': 'space.nameTaken',
  'crm.spaces.SpaceInUse': 'space.inUse',
  'crm.spaces.ItemAlreadyRecorded': 'space.itemAlreadyRecorded',
  'crm.catalog.SingleRuleViolated': 'space.singleRuleViolated',
  'crm.catalog.NotApplicableToSpaceType': 'space.notApplicable',
  // Custom entries (F4) — the either/or add and the promote flow
  'crm.catalog.CustomNameRequired': 'space.customNameRequired',
  'crm.catalog.NotACustomEntry': 'space.notACustomEntry',
  'crm.catalog.PromotionCategoryMismatch': 'cat.promotionMismatch',
  'crm.catalog.AttributeNotApplicable': 'space.attrNotApplicable',
  // Brief entries reached through the space note
  'crm.briefs.EntryLocked': 'space.entryLocked',
};

/** The translated key for a server error code, or `fallback` when the code is unmapped. */
export function domainErrorKey(code: string | null | undefined, fallback: CatalogKey): CatalogKey {
  return (code && CODE_TO_KEY[code]) || fallback;
}

/**
 * Category-tinted placeholder art for a product card with no `imageUri` — reproducing the
 * IDEA from `prototype-v2.html`'s `CATART` (a per-root-category tint, never a broken-image
 * icon), not its literal SVGs or its hardcoded 4-root-id lookup table. The real catalog's
 * root category ids are not known ahead of time, so the tint is a stable hash of the root
 * id into a small fixed palette of existing DS soft/ink token pairs — deterministic (the
 * same root always gets the same tint) without hardcoding which root means what.
 */

interface CategoryTint {
  readonly bg: string;
  readonly fg: string;
}

const PALETTE: readonly CategoryTint[] = [
  { bg: 'bg-warning-soft', fg: 'text-warning' },
  { bg: 'bg-accent-soft', fg: 'text-accent' },
  { bg: 'bg-pending-soft', fg: 'text-pending' },
  { bg: 'bg-info-soft', fg: 'text-info' },
];

/** Deterministic — the same root category id always maps to the same tint. */
export function categoryTint(rootCategoryId: string): CategoryTint {
  let hash = 0;
  for (let i = 0; i < rootCategoryId.length; i++) {
    hash = (hash * 31 + rootCategoryId.charCodeAt(i)) >>> 0;
  }
  return PALETTE[hash % PALETTE.length];
}

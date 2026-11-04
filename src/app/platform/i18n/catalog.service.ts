import { Injectable, computed, inject } from '@angular/core';
import { isDevMode } from '@angular/core';
import { LocaleService } from './locale.service';
import { EN, type CatalogKey } from './catalog/en';
import { AR } from './catalog/ar';
import { intlLocale } from './intl-locale';

/**
 * The catalog keys of one count phrase, by CLDR plural category (`Intl.PluralRules`).
 * `other` is required and is the fallback; English uses `one`/`other`, Arabic all six.
 */
export type PluralForms = Partial<Record<Intl.LDMLPluralRule, CatalogKey>> & {
  other: CatalogKey;
};

/**
 * The app's string catalog — feature 004, its first bilingual feature.
 *
 * Driven by the **existing** `LocaleService.locale()` signal, which already backs
 * the ع toggle in the topbar. There is exactly ONE locale signal in this app and
 * this service does not introduce a second (FR-037).
 *
 * Resolution order:
 *   1. the Arabic value, when the locale is `ar` and the value exists;
 *   2. the English value — a missing Arabic value degrades to English, never to a
 *      blank and never to a raw key (FR-037b);
 *   3. the key itself, loudly in dev — a missing key is a bug, not a fallback.
 *
 * Arabic completeness on client-facing surfaces is enforced by the batch GATE
 * (SC-010), not by the compiler: the compiler cannot tell a client screen from an
 * office one, so `AR` is deliberately `Partial` and office screens may fall back.
 */
@Injectable({ providedIn: 'root' })
export class CatalogService {
  private readonly localeService = inject(LocaleService);

  /** Re-exposed so a template can select payload labels (`nameEn` / `nameAr`). */
  readonly locale = this.localeService.locale;

  /** The active dictionary. Recomputes when the ع toggle flips. */
  private readonly dictionary = computed<Partial<Record<CatalogKey, string>>>(() =>
    this.locale() === 'ar' ? AR : EN,
  );

  /**
   * Resolve `key` in the active locale, interpolating `{slot}` params.
   *
   * ⛔ Chrome only. Catalog node / attribute names and space-type names are DATA —
   * they arrive bilingual in the payload and must be selected from it, never looked
   * up here (contracts/string-catalog.md §4).
   */
  t(key: CatalogKey, params?: Record<string, string | number>): string {
    const value = this.dictionary()[key] ?? EN[key];

    if (value === undefined) {
      if (isDevMode()) {
        console.error(`[catalog] missing key: ${key}`);
      }
      return key;
    }

    return params ? interpolate(value, params) : value;
  }

  /**
   * crm-prod L-fe-3: a route's `data.breadcrumb`. A catalog key resolves in the active locale;
   * anything else is a literal label from a module whose crumbs are not catalogued yet.
   */
  label(value: string): string {
    return isCatalogKey(value) ? this.t(value) : value;
  }

  /**
   * crm-prod L-fe-1: a plural-safe count phrase. Picks the form for `n`'s plural category in the
   * active locale (`Intl.PluralRules`, so Arabic gets its zero/one/two/few/many/other), falling
   * back to `forms.other`, and fills `{n}` with the count.
   */
  plural(forms: PluralForms, n: number, params?: Record<string, string | number>): string {
    const category = new Intl.PluralRules(intlLocale(this.locale())).select(n);
    return this.t(forms[category] ?? forms.other, { ...params, n });
  }
}

/** crm-prod L-fe-1: "{n} stage(s)" in every plural form. */
export const STAGE_COUNT: PluralForms = {
  zero: 'common.stagesZero',
  one: 'common.stagesOne',
  two: 'common.stagesTwo',
  few: 'common.stagesFew',
  many: 'common.stagesMany',
  other: 'common.stagesOther',
};

/** True when `value` names a key of the English catalog (the key set of record). */
export function isCatalogKey(value: string): value is CatalogKey {
  return Object.prototype.hasOwnProperty.call(EN, value);
}

/** Replaces `{name}`-style slots. An absent param leaves its slot untouched. */
function interpolate(value: string, params: Record<string, string | number>): string {
  return value.replace(/\{(\w+)\}/g, (slot, name: string) =>
    name in params ? String(params[name]) : slot,
  );
}

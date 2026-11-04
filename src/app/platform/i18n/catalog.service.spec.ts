import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { CatalogService, STAGE_COUNT } from './catalog.service';
import { LocaleService } from './locale.service';
import { EN, type CatalogKey } from './catalog/en';
import { AR } from './catalog/ar';

/**
 * The catalog is the substrate FR-008a makes a precondition of every screen batch.
 * These tests pin the four behaviours the gate (T029) checks by hand:
 *   EN lookup · AR lookup · AR-missing → EN (never a blank, never a raw key) ·
 *   missing key → the key, echoed loudly.
 */
describe('CatalogService', () => {
  let catalog: CatalogService;
  let locale: LocaleService;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [CatalogService, LocaleService] });
    catalog = TestBed.inject(CatalogService);
    locale = TestBed.inject(LocaleService);
    locale.locale.set('en');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('crm-prod L-fe-1: plural() picks the English one/other form ("1 stage", "2 stages")', () => {
    expect(catalog.plural(STAGE_COUNT, 1)).toBe('1 stage');
    expect(catalog.plural(STAGE_COUNT, 2)).toBe('2 stages');
    expect(catalog.plural(STAGE_COUNT, 0)).toBe('0 stages');
  });

  it('crm-prod L-fe-1: plural() picks the Arabic one/two/few/many/other forms', () => {
    locale.locale.set('ar');
    expect(catalog.plural(STAGE_COUNT, 1)).toBe('مرحلة واحدة');
    expect(catalog.plural(STAGE_COUNT, 2)).toBe('مرحلتان');
    expect(catalog.plural(STAGE_COUNT, 3)).toBe('3 مراحل');
    expect(catalog.plural(STAGE_COUNT, 10)).toBe('10 مراحل');
    expect(catalog.plural(STAGE_COUNT, 11)).toBe('11 مرحلة');
    expect(catalog.plural(STAGE_COUNT, 100)).toBe('100 مرحلة');
  });

  it('resolves a key in English', () => {
    expect(catalog.t('trust.approved')).toBe('Approved');
    expect(catalog.t('trust.unconfirmed')).toBe('UNCONFIRMED');
  });

  it('resolves a key in Arabic once the ع toggle flips', () => {
    locale.locale.set('ar');
    expect(catalog.t('trust.approved')).toBe('معتمد');
    expect(catalog.t('trust.unconfirmed')).toBe('غير مؤكد');
  });

  it('re-resolves when the ONE locale signal flips, in both directions', () => {
    expect(catalog.t('trust.locked')).toBe('locked');
    locale.locale.set('ar');
    expect(catalog.t('trust.locked')).toBe('مقفل');
    locale.locale.set('en');
    expect(catalog.t('trust.locked')).toBe('locked');
  });

  // FR-037b — the asymmetry the type system encodes: AR is Partial, so a missing
  // Arabic value is legal and MUST degrade to English. Never a blank, never a key.
  it('degrades a missing Arabic value to English — not to a blank, not to a raw key', () => {
    // The harvest is currently complete, so the gap has to be manufactured. Poke a
    // real hole in AR and drive the real lookup — this is the code path FR-037b is
    // about, and office screens rely on it (they share the keys and fall back).
    const key = 'trust.approved' as CatalogKey;
    const original = AR[key];
    delete AR[key];

    try {
      locale.locale.set('ar');
      const resolved = catalog.t(key);

      expect(resolved).toBe(EN[key]);
      expect(resolved).toBe('Approved');
      expect(resolved).not.toBe('');
      expect(resolved).not.toBe(key);
    } finally {
      AR[key] = original;
    }
  });

  it('echoes an unknown key and shouts in dev — a missing key is a bug, not a fallback', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const bogus = 'nope.not.a.key' as CatalogKey;

    expect(catalog.t(bogus)).toBe('nope.not.a.key');
    expect(error).toHaveBeenCalledWith('[catalog] missing key: nope.not.a.key');
  });

  it('interpolates {slot} params', () => {
    expect(catalog.t('gate.metOf', { met: 0, total: 4 })).toBe('0 of 4 met');
    locale.locale.set('ar');
    expect(catalog.t('gate.metOf', { met: 0, total: 4 })).toBe('0 من 4 مستوفاة');
  });

  // T093 / SC-006 — the `{since}` slot is authored from day one, because
  // briefPendingSinceUtc does not exist yet (Dependency 3). An unfilled slot must
  // leave the sentence readable, so the fact can land later as data, not a redesign.
  it('leaves an unfilled slot intact rather than printing "undefined"', () => {
    const resolved = catalog.t('task.blocked.brief', { round: 3 });
    expect(resolved).toContain('round 3');
    expect(resolved).not.toContain('undefined');
    expect(resolved).toContain('{since}');
  });

  it('supplies the whole trust-chip vocabulary in both locales (SC-004)', () => {
    const chipKeys: CatalogKey[] = [
      'trust.draft',
      'trust.pending',
      'trust.approved',
      'trust.trusted',
      'trust.rejected',
      'trust.superseded',
      'trust.closed',
      'trust.locked',
      'trust.unconfirmed',
    ];

    for (const key of chipKeys) {
      expect(EN[key], `EN missing ${key}`).toBeTruthy();
      expect(AR[key], `AR missing ${key}`).toBeTruthy();
    }
  });

  // FR-037c — Arabic is HARVESTED, never re-translated. A regression here means
  // someone hand-wrote a value instead of taking it from the reviewed dictionary.
  //
  // The initial 592-key harvest was 100% EN/AR symmetric. FR-037b legally allows an
  // OFFICE-only key to ship English-first, Arabic as a fast-follow — client-facing keys
  // have no such exception, FR-037a — and `KNOWN_OFFICE_ONLY_GAPS` is that mechanism:
  // the same shape as the eslint suppressions baseline, an intentional, enumerated,
  // non-growing-without-review exception list, not a blanket pass or a parity check with
  // the teeth removed. It is EMPTY today, not deleted: every key that once sat on it now
  // carries Arabic (see en.ts's rewritten "authored, not harvested" note), so there is
  // currently nothing to exempt — but the mechanism stays live for the next genuinely
  // office-only key, which belongs here, reviewed and named, not translated by reflex or
  // "fixed" by deleting this test.
  //
  // The 30 `brief.opt*`/`brief.f*` keys that used to sit here (a "B3 exception,
  // office-only (FR-037b)" note claimed) can never return to this list: they render in
  // the `crm.portal` CLIENT shell — `client/head-diff-format.ts`'s `HEAD_DIFF_FIELD_KEYS`,
  // `ENUM_FIELD_KEYS` and `HIRING_REASON_KEYS`, reached from `client-approvals-page` →
  // `approvals-inbox.component.ts` — which is FR-037a, where Arabic was never optional.
  // The office-only classification was wrong for them from the start; re-adding any of
  // them here without first checking `head-diff-format.ts` would reopen that exact bug.
  const KNOWN_OFFICE_ONLY_GAPS: CatalogKey[] = [];

  it('carries an Arabic value for every English key, except the known office-only gaps (FR-037b)', () => {
    const missing = (Object.keys(EN) as CatalogKey[]).filter((k) => !AR[k]);
    expect(missing.sort()).toEqual([...KNOWN_OFFICE_ONLY_GAPS].sort());
  });
});

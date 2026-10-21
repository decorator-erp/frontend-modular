import { Injectable, inject } from '@angular/core';
import { LocaleService, type Locale } from '@platform/i18n/locale.service';

/**
 * Single source of truth for money formatting and string-decimal arithmetic.
 *
 * The Financial API serialises every monetary value as a decimal STRING
 * (`decimal(19,4)`, per `api-docs/11-finance.md`). To preserve precision, this
 * service refuses to round-trip values through `parseFloat`; arithmetic is
 * performed on string-decimals via BigInt, scaled to 4 fractional digits.
 *
 * Conversion to a JS `number` happens only at the `Intl.NumberFormat` boundary
 * inside `format()` — never in calling code.
 */
@Injectable({ providedIn: 'root' })
export class MoneyService {
  private readonly locale = inject(LocaleService);
  /** decimal(19,4) → 4 fractional digits, BigInt-safe. */
  private readonly SCALE = 4n;
  private readonly SCALE_NUM = 10_000n;

  /**
   * Format a money value in the given currency. Accepts a string-decimal (the
   * preferred path — that's how the API sends it) or a JS number (for legacy
   * callers). The conversion to a JS double happens only here, after the
   * value has been preserved as a string up to the Intl boundary.
   */
  format(input: string | number, currency: string, locale: Locale = this.locale.locale()): string {
    if (input === '' || input === null || input === undefined) return '—';
    const value = typeof input === 'number' ? input : +input;
    if (!Number.isFinite(value)) return '—';
    return new Intl.NumberFormat(this.intlLocale(locale), {
      style: 'currency',
      currency,
      currencyDisplay: 'narrowSymbol',
      minimumFractionDigits: 2,
    }).format(value);
  }

  /**
   * Normalise a user-entered or backend-supplied string to the canonical
   * decimal form: optional leading sign, integer part, optional `.` and up to
   * 4 fractional digits. Returns `''` if the input is not a valid decimal.
   * Never converts to a JS number.
   */
  parse(input: string): string {
    const cleaned = (input ?? '').toString().trim().replace(/[,\s]/g, '');
    if (!cleaned) return '';
    const match = /^([+-]?)(\d+)(?:\.(\d+))?$/.exec(cleaned);
    if (!match) return '';
    const sign = match[1] === '-' ? '-' : '';
    const intPart = match[2].replace(/^0+(?=\d)/, '');
    const fracPart = (match[3] ?? '').slice(0, 4).replace(/0+$/, '');
    return fracPart ? `${sign}${intPart}.${fracPart}` : `${sign}${intPart}`;
  }

  /**
   * Sum any number of string-decimals using BigInt arithmetic — no JS number
   * involvement, full precision preserved up to the decimal(19,4) ceiling.
   */
  add(...vals: string[]): string {
    let acc = 0n;
    for (const v of vals) {
      const scaled = this.toScaled(v);
      if (scaled === null) continue;
      acc += scaled;
    }
    return this.fromScaled(acc);
  }

  /** `a − b` on string-decimals, BigInt-exact. The subtraction counterpart to `add`. */
  subtract(a: string, b: string): string {
    return this.fromScaled((this.toScaled(a) ?? 0n) - (this.toScaled(b) ?? 0n));
  }

  /**
   * Compact format for headline KPIs — e.g. `EGP 14.6M`, `EGP 720K`. Uses
   * `Intl.NumberFormat` with `notation: 'compact'`, so locale-aware. Keeps
   * one fraction digit so big numbers don't lose all signal.
   */
  formatCompact(
    input: string | number,
    currency: string,
    locale: Locale = this.locale.locale(),
  ): string {
    if (input === '' || input === null || input === undefined) return '—';
    const value = typeof input === 'number' ? input : +input;
    if (!Number.isFinite(value)) return '—';
    return new Intl.NumberFormat(this.intlLocale(locale), {
      style: 'currency',
      currency,
      currencyDisplay: 'narrowSymbol',
      notation: 'compact',
      maximumFractionDigits: 1,
    }).format(value);
  }

  /**
   * Format with an explicit `+` or `−` prefix. Useful in ledger lists where a
   * direction sign helps scanning. Zero is rendered without a sign.
   */
  signed(input: string, currency: string, locale: Locale = this.locale.locale()): string {
    const scaled = this.toScaled(input);
    if (scaled === null) return '—';
    if (scaled === 0n) return this.format(input, currency, locale);
    const absolute = scaled < 0n ? -scaled : scaled;
    const formatted = this.format(this.fromScaled(absolute), currency, locale);
    return scaled < 0n ? `−${formatted}` : `+${formatted}`;
  }

  /** True if the string-decimal is strictly negative. Avoids parseFloat. */
  isNegative(input: string): boolean {
    const scaled = this.toScaled(input);
    return scaled !== null && scaled < 0n;
  }

  /** Compare two string-decimals: -1, 0, or 1. Avoids parseFloat. */
  compare(a: string, b: string): -1 | 0 | 1 {
    const sa = this.toScaled(a) ?? 0n;
    const sb = this.toScaled(b) ?? 0n;
    return sa < sb ? -1 : sa > sb ? 1 : 0;
  }

  /**
   * Ratio of two string-decimals as a clamped 0..100 percentage NUMBER — for
   * progress-bar widths. Computed via BigInt scaling so the money strings are
   * never run through `+` / `parseFloat` in calling code. Returns 0 when
   * `whole` is non-positive or either value is invalid.
   */
  percentOf(part: string, whole: string): number {
    const p = this.toScaled(part);
    const w = this.toScaled(whole);
    if (p === null || w === null || w <= 0n) return 0;
    const pct = Number((p * 10_000n) / w) / 100;
    return Math.min(100, Math.max(0, pct));
  }

  /**
   * Format a backend percentage value (already 0..100, NOT money) to one
   * decimal place with a `%` suffix. Returns `—` for empty / non-finite input.
   */
  formatPercent(input: string | number | null | undefined): string {
    if (input === null || input === undefined || input === '') return '—';
    const value = typeof input === 'number' ? input : +input;
    if (!Number.isFinite(value)) return '—';
    return `${value.toFixed(1)}%`;
  }

  private toScaled(input: string): bigint | null {
    const normalized = this.parse(input);
    if (!normalized) return null;
    const negative = normalized.startsWith('-');
    const body = negative ? normalized.slice(1) : normalized;
    const [intPart, fracPart = ''] = body.split('.');
    const padded = (fracPart + '0000').slice(0, 4);
    try {
      const scaled = BigInt(intPart) * this.SCALE_NUM + BigInt(padded);
      return negative ? -scaled : scaled;
    } catch {
      return null;
    }
  }

  private fromScaled(scaled: bigint): string {
    const negative = scaled < 0n;
    const absolute = negative ? -scaled : scaled;
    const intPart = absolute / this.SCALE_NUM;
    const fracPart = absolute % this.SCALE_NUM;
    const fracStr = fracPart.toString().padStart(Number(this.SCALE), '0').replace(/0+$/, '');
    const body = fracStr ? `${intPart}.${fracStr}` : `${intPart}`;
    return negative ? `-${body}` : body;
  }

  private intlLocale(locale: Locale): string {
    return locale === 'ar' ? 'ar-EG' : 'en-US';
  }
}

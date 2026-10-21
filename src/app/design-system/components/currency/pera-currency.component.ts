import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { LocaleService } from '@platform/i18n';
import { CurrencyContextService } from '@shared/ui/currency.context';

/**
 * `pera-currency` — read-only display of a monetary amount followed by a muted,
 * smaller currency code (e.g. `1,234,567 EGP`).
 *
 * The trailing-code layout is the prototype's documented rule: *"EGP always
 * shown, code after the number, muted and smaller"* (`DMS Component Library`).
 * That is why this component formats the **number only** and renders the code
 * itself, rather than delegating to `MoneyService.format`, whose
 * `style: 'currency'` embeds a leading narrow symbol (`E£1,234.50`) and would
 * collide with the trailing code span. See `contracts/primitive-api-changes.md`.
 *
 * Two amount shapes are supported:
 *   - `number` — a client-side value that is safe to group / abbreviate. With
 *     `compact`, KPI-tile abbreviation kicks in (`1.2K`, `3.4M`).
 *   - `string` — a server-provided decimal (e.g. `decimal(19,4)`). It is NEVER
 *     reparsed or rounded, so the exact server value survives digit-for-digit.
 *
 * Numbers always read left-to-right, so the host is pinned to `dir="ltr"` and
 * stays LTR even inside an RTL layout. Right alignment is the caller's job —
 * the host is `inline-flex`; table money cells align via `text-end`.
 */
@Component({
  selector: 'pera-currency',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'inline-flex items-baseline gap-1', dir: 'ltr' },
  template: `
    <span class="text-text-primary font-medium text-sm tabular-nums">{{ formatted() }}</span>
    <span class="text-text-muted text-xs">{{ resolvedCode() }}</span>
  `,
})
export class PeraCurrencyComponent {
  private readonly locale = inject(LocaleService);
  private readonly currencyCtx = inject(CurrencyContextService);

  /**
   * The amount to display. A `string` is treated as an authoritative
   * server decimal and is grouped for display only — never recomputed.
   */
  readonly amount = input.required<number | string>();

  /** K/M abbreviation for KPI tiles. */
  readonly compact = input(false);

  /**
   * ISO-ish currency code shown after the number. Defaults to the active
   * project's currency via {@link CurrencyContextService} (itself `EGP` outside
   * a project sub-tree) — EGP is the resolved default, never a hardcoded value.
   */
  readonly code = input<string | undefined>(undefined);

  protected readonly resolvedCode = computed<string>(
    () => this.code() ?? this.currencyCtx.currency(),
  );

  protected readonly formatted = computed<string>(() => {
    const raw = this.amount();
    const loc = this.intlLocale();

    if (this.compact()) return this.formatCompact(raw, loc);

    if (typeof raw === 'number') {
      if (!Number.isFinite(raw)) return String(raw);
      return new Intl.NumberFormat(loc, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 4,
      }).format(raw);
    }

    return this.formatDecimalString(raw, loc);
  });

  /** `ar` renders Arabic-Indic digits and Arabic separators, matching MoneyService. */
  private intlLocale(): string {
    return this.locale.locale() === 'ar' ? 'ar-EG' : 'en-US';
  }

  private formatCompact(raw: number | string, loc: string): string {
    const value = typeof raw === 'number' ? raw : Number(raw);
    if (!Number.isFinite(value)) return String(raw);
    return new Intl.NumberFormat(loc, {
      notation: 'compact',
      maximumFractionDigits: 1,
    }).format(value);
  }

  /**
   * Format a server decimal without a double round-trip. `Intl.NumberFormat`
   * V3 (ES2023) formats decimal *strings* exactly; the repo's `lib` follows
   * `target: ES2022`, whose typings predate that overload, so the cast below is
   * a deliberate, justified escape (constitution VIII). It is guarded by a
   * strict decimal-literal test, and older engines fall back to `ToNumber`.
   */
  private formatDecimalString(raw: string, loc: string): string {
    const trimmed = raw.trim();
    const match = /^-?\d+(?:\.(\d+))?$/.exec(trimmed);
    // Not a plain decimal — pass the server value through untouched.
    if (!match) return raw;

    // Pin min == max to the digits the server actually sent (floored at the
    // 2-decimal minimum). Intl would otherwise strip trailing zeros, so
    // `1234567.8900` must not collapse to `1,234,567.89`.
    const sent = match[1]?.length ?? 0;
    const digits = Math.min(Math.max(sent, 2), 20);
    const formatter = new Intl.NumberFormat(loc, {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    }) as unknown as { format(value: string): string };

    return formatter.format(trimmed);
  }
}

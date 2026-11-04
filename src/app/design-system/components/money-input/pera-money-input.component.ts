import {
  ChangeDetectionStrategy,
  Component,
  computed,
  forwardRef,
  inject,
  input,
  signal,
} from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { LocaleService } from '@platform/i18n';
import { toAsciiDigits } from '@platform/i18n/intl-locale';
import { CurrencyContextService } from '@shared/ui/currency.context';
import { MoneyService } from '@shared/ui/money.service';

const HEIGHT = { sm: 'h-7 fs-body-sm', md: 'h-8 text-sm', lg: 'h-10 text-sm' } as const;

/**
 * Currency-aware money input. The ControlValueAccessor surface is a STRING
 * decimal — the form control never sees a JS number, in line with
 * `FEATURE_PROMPT_FINANCE.md` Phase F1.3 and the contract in
 * `api-docs/11-finance.md` (decimal(19,4)).
 *
 * Behaviour:
 *   - On focus, the displayed value flips to the raw editable string so the
 *     user can type without fighting separators.
 *   - On blur, the raw is formatted through `MoneyService.format` using the
 *     project's currency context (or a per-instance `currency` override).
 *   - Right-aligned in LTR, start-aligned in RTL — `Intl.NumberFormat`
 *     handles the symbol mirroring inside the formatted display.
 *
 * Validation is delegated to the parent FormControl via
 * `shared/forms/validators.finance.ts` (moneyPositive / moneyMax / moneyDecimals).
 */
@Component({
  selector: 'pera-money-input',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => PeraMoneyInputComponent),
      multi: true,
    },
  ],
  host: { class: 'block w-full' },
  template: `
    <input
      type="text"
      inputmode="decimal"
      dir="ltr"
      [value]="display()"
      [placeholder]="placeholder()"
      [disabled]="isDisabled()"
      [readonly]="readonly()"
      [attr.aria-invalid]="error() ? 'true' : null"
      [attr.aria-describedby]="ariaDescribedBy() || null"
      [class]="classes()"
      (focus)="onFocus()"
      (input)="onInput($event)"
      (blur)="onBlur()"
    />
  `,
})
export class PeraMoneyInputComponent implements ControlValueAccessor {
  private readonly money = inject(MoneyService);
  private readonly currencyCtx = inject(CurrencyContextService);
  private readonly locale = inject(LocaleService);

  /** Override the global currency for this input. */
  readonly currency = input<string | null>(null);
  readonly size = input<'sm' | 'md' | 'lg'>('md');
  readonly placeholder = input('');
  readonly disabled = input(false);
  readonly readonly = input(false);
  readonly error = input<string | undefined>(undefined);
  readonly ariaDescribedBy = input<string | undefined>(undefined);

  /**
   * Whether negative input is allowed. Defaults to `false` — money in this
   * app is always rendered as positive, with direction or sign carried by a
   * sibling field (e.g. ledger `direction`). Set to `true` only for cases
   * like signed deltas where the sign is part of the value.
   */
  readonly allowNegative = input(false);
  readonly digitsBeforeDecimal = input(15);
  readonly digitsAfterDecimal = input(4);

  /** Raw canonical decimal string (what the form control sees). */
  private readonly raw = signal('');
  /** What's shown in the `<input>` element. Editable while focused, formatted on blur. */
  protected readonly display = signal('');
  private readonly cvaDisabled = signal(false);
  private isFocused = false;

  protected readonly isDisabled = computed(() => this.disabled() || this.cvaDisabled());

  protected readonly classes = computed(() =>
    [
      'w-full px-3 bg-surface text-text-primary border outline-none tabular-nums text-end',
      'placeholder:text-text-muted',
      'focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2',
      HEIGHT[this.size()],
      this.error() ? 'border-danger' : 'border-border',
      this.isDisabled() ? 'opacity-45 cursor-not-allowed bg-surface-muted' : '',
    ].join(' '),
  );

  private onChange: (v: string) => void = () => {};
  private onTouched: () => void = () => {};

  protected onFocus(): void {
    this.isFocused = true;
    // Show the canonical raw string so the user edits the actual stored value.
    this.display.set(this.raw());
  }

  protected onInput(event: Event): void {
    // crm-prod L-fe-2: Arabic-Indic digits and separators are typed as their ASCII twins.
    const typed = toAsciiDigits((event.target as HTMLInputElement).value);
    // Strip thousands separators and any whitespace; keep digits, the
    // decimal point, and a leading sign.
    const cleaned = typed.replace(/[,\s]/g, '');
    if (!this.allowNegative() && cleaned.startsWith('-')) {
      // Reject negative input by stripping the sign — the validator on the
      // parent control will keep flagging this as an error if needed.
      const sanitised = cleaned.replace(/^-+/, '');
      this.display.set(sanitised);
      this.commit(sanitised);
      return;
    }
    this.display.set(typed);
    this.commit(cleaned);
  }

  protected onBlur(): void {
    this.isFocused = false;
    this.onTouched();
    const value = this.raw();
    if (!value) {
      this.display.set('');
      return;
    }
    this.display.set(this.money.format(value, this.activeCurrency(), this.locale.locale()));
  }

  private commit(rawInput: string): void {
    const normalised = this.money.parse(rawInput);
    // Enforce digitsAfterDecimal — truncate (not round) so a user typing
    // can't sneak past the on-blur format. Validators flag this as well.
    const truncated = this.truncate(normalised);
    this.raw.set(truncated);
    this.onChange(truncated);
  }

  private truncate(value: string): string {
    if (!value) return '';
    const [intPart, fracPart = ''] = value.replace(/^[+-]/, '').split('.');
    const sign = value.startsWith('-') ? '-' : '';
    const trimmedInt = intPart.slice(0, this.digitsBeforeDecimal());
    const trimmedFrac = fracPart.slice(0, this.digitsAfterDecimal());
    return trimmedFrac ? `${sign}${trimmedInt}.${trimmedFrac}` : `${sign}${trimmedInt}`;
  }

  private activeCurrency(): string {
    return this.currency() ?? this.currencyCtx.currency();
  }

  // ControlValueAccessor -----------------------------------------------------

  writeValue(value: unknown): void {
    const next = value === null || value === undefined ? '' : String(value);
    const normalised = this.money.parse(next);
    this.raw.set(normalised);
    if (this.isFocused) {
      this.display.set(normalised);
    } else if (normalised) {
      this.display.set(this.money.format(normalised, this.activeCurrency(), this.locale.locale()));
    } else {
      this.display.set('');
    }
  }
  registerOnChange(fn: (v: string) => void): void {
    this.onChange = fn;
  }
  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }
  setDisabledState(isDisabled: boolean): void {
    this.cvaDisabled.set(isDisabled);
  }
}

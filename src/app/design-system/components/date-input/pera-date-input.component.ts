import {
  ChangeDetectionStrategy,
  Component,
  computed,
  forwardRef,
  input,
  signal,
} from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

const HEIGHT = { sm: 'h-7 fs-body-sm', md: 'h-8 text-sm', lg: 'h-10 text-sm' } as const;

/**
 * ISO date input. The ControlValueAccessor surface is a `YYYY-MM-DD` string
 * (matches `api-docs/11-finance.md` and every backend DTO that takes a date,
 * e.g. `occurredOn`, `issuedOn`, `dueOn`).
 *
 * Wraps `<input type="date">` so the browser handles locale-aware date
 * pickers; the wire format stays ISO regardless of locale.
 */
@Component({
  selector: 'pera-date-input',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => PeraDateInputComponent),
      multi: true,
    },
  ],
  host: { class: 'block w-full' },
  template: `
    <input
      type="date"
      [value]="value()"
      [min]="min() ?? null"
      [max]="max() ?? null"
      [disabled]="isDisabled()"
      [readonly]="readonly()"
      [attr.aria-invalid]="error() ? 'true' : null"
      [class]="classes()"
      (input)="onInput($event)"
      (blur)="onTouched()"
    />
  `,
})
export class PeraDateInputComponent implements ControlValueAccessor {
  readonly size = input<'sm' | 'md' | 'lg'>('md');
  readonly disabled = input(false);
  readonly readonly = input(false);
  readonly error = input<string | undefined>(undefined);
  /** ISO `YYYY-MM-DD`. */
  readonly min = input<string | null>(null);
  /** ISO `YYYY-MM-DD`. */
  readonly max = input<string | null>(null);

  readonly value = signal('');
  private readonly cvaDisabled = signal(false);
  protected readonly isDisabled = computed(() => this.disabled() || this.cvaDisabled());

  protected readonly classes = computed(() =>
    [
      'w-full px-3 bg-surface text-text-primary border outline-none',
      'focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2',
      HEIGHT[this.size()],
      this.error() ? 'border-danger' : 'border-border',
      this.isDisabled() ? 'opacity-45 cursor-not-allowed bg-surface-muted' : '',
    ].join(' '),
  );

  private onChange: (v: string) => void = () => {};
  protected onTouched: () => void = () => {};

  protected onInput(event: Event): void {
    const v = (event.target as HTMLInputElement).value;
    this.value.set(v);
    this.onChange(v);
  }

  writeValue(v: unknown): void {
    this.value.set(v === null || v === undefined ? '' : String(v));
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

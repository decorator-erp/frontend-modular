import {
  ChangeDetectionStrategy,
  Component,
  computed,
  forwardRef,
  input,
  signal,
} from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { PeraIconComponent } from '../icon/pera-icon.component';

const HEIGHT = { sm: 'h-7 fs-body-sm', md: 'h-8 text-sm', lg: 'h-10 text-sm' } as const;

@Component({
  selector: 'pera-input',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PeraIconComponent],
  providers: [
    { provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => PeraInputComponent), multi: true },
  ],
  // Not a hard-coded `block w-full`: a consumer's width utility would lose to it
  // (Tailwind emits `w-full` last), stretching the control and breaking any
  // inline row it sits in — see `pera-filter-bar`.
  host: {
    '[class.block]': '!inline()',
    '[class.w-full]': '!inline()',
    '[class.inline-block]': 'inline()',
  },
  template: `
    <div class="relative w-full">
      @if (iconStart()) {
        <pera-icon
          [name]="iconStart()!"
          [size]="14"
          class="absolute start-3 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none"
        />
      }
      <input
        [type]="type()"
        [value]="value()"
        [placeholder]="placeholder()"
        [disabled]="isDisabled()"
        [readonly]="readonly()"
        [attr.autocomplete]="autocomplete() || null"
        [attr.aria-invalid]="error() ? 'true' : null"
        [attr.aria-label]="ariaLabel() || null"
        [class]="classes()"
        (input)="onInput($event)"
        (blur)="onTouched()"
      />
      @if (iconEnd()) {
        <pera-icon
          [name]="iconEnd()!"
          [size]="14"
          class="absolute end-3 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none"
        />
      }
    </div>
  `,
})
export class PeraInputComponent implements ControlValueAccessor {
  readonly type = input<
    'text' | 'email' | 'password' | 'number' | 'search' | 'tel' | 'url' | 'datetime-local'
  >('text');
  readonly size = input<'sm' | 'md' | 'lg'>('md');
  readonly placeholder = input('');
  readonly disabled = input(false);
  readonly readonly = input(false);
  readonly autocomplete = input<string | undefined>(undefined);
  readonly error = input<string | undefined>(undefined);
  /** Accessible name for a control with no visible label (e.g. a grid cell). */
  readonly ariaLabel = input<string | undefined>(undefined);
  readonly iconStart = input<string | undefined>(undefined);
  readonly iconEnd = input<string | undefined>(undefined);
  /** Drops the full-width host so the control can sit inline and be sized by the caller. */
  readonly inline = input(false);

  readonly value = signal('');
  private readonly cvaDisabled = signal(false);
  readonly isDisabled = computed(() => this.disabled() || this.cvaDisabled());

  readonly classes = computed(() =>
    [
      'w-full px-3 bg-surface text-text-primary border rounded-sm outline-none',
      'placeholder:text-text-muted',
      'focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2',
      HEIGHT[this.size()],
      this.error() ? 'border-danger' : 'border-border',
      this.isDisabled() ? 'opacity-45 cursor-not-allowed bg-surface-muted' : '',
      this.iconStart() ? 'ps-9' : '',
      this.iconEnd() ? 'pe-9' : '',
    ].join(' '),
  );

  onChange: (v: string) => void = () => {};
  onTouched: () => void = () => {};

  onInput(event: Event): void {
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

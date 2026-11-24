import {
  ChangeDetectionStrategy,
  Component,
  computed,
  forwardRef,
  input,
  signal,
} from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

export interface SegmentedOption {
  value: unknown;
  label: string;
  disabled?: boolean;
}

/**
 * `.ch3` — single-select chips (the DMS Forms handoff's `chips` field type).
 * One choice at a time: priority, gate trigger, condition type, member access.
 * A `ControlValueAccessor`, so it drops straight onto a reactive `formControlName`.
 *
 * Selected = ink fill (`bg-text-primary text-bg`); the rest are hairline-bordered
 * surface chips. Square corners, no shadow — per the design ground rules.
 */
@Component({
  selector: 'pera-segmented',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => PeraSegmentedComponent),
      multi: true,
    },
  ],
  host: { class: 'block' },
  template: `
    <!-- OS-1 (Ocean Studio): one rounded track; the picked option is filled navy. -->
    <div
      class="inline-flex flex-wrap gap-1 p-1 rounded-[var(--radius-control)] bg-surface border border-border"
      role="radiogroup"
      [attr.aria-label]="ariaLabel() || null"
    >
      @for (opt of options(); track $index) {
        <button
          type="button"
          role="radio"
          [attr.aria-checked]="isSelected(opt)"
          [disabled]="isDisabled() || opt.disabled"
          (click)="pick(opt)"
          (blur)="onTouched()"
          class="fs-body-sm leading-normal font-semibold px-3 py-1.5 rounded-[var(--radius-md)] cursor-pointer transition-colors
                 outline-none focus-visible:outline-2 focus-visible:outline-accent
                 disabled:opacity-45 disabled:cursor-not-allowed"
          [class.bg-sidebar]="isSelected(opt)"
          [class.text-sidebar-active-text]="isSelected(opt)"
          [class.text-text-secondary]="!isSelected(opt)"
          [class.hover:bg-surface-muted]="!isSelected(opt)"
          [class.hover:text-text-primary]="!isSelected(opt)"
        >
          {{ opt.label }}
        </button>
      }
    </div>
  `,
})
export class PeraSegmentedComponent implements ControlValueAccessor {
  readonly options = input<SegmentedOption[]>([]);
  readonly disabled = input(false);
  readonly ariaLabel = input<string | undefined>(undefined);

  readonly value = signal<unknown>(null);
  private readonly cvaDisabled = signal(false);
  readonly isDisabled = computed(() => this.disabled() || this.cvaDisabled());

  isSelected(opt: SegmentedOption): boolean {
    return opt.value === this.value();
  }

  pick(opt: SegmentedOption): void {
    if (this.isDisabled() || opt.disabled) return;
    this.value.set(opt.value);
    this.onChange(opt.value);
    this.onTouched();
  }

  onChange: (v: unknown) => void = () => {};
  onTouched: () => void = () => {};

  writeValue(v: unknown): void {
    this.value.set(v);
  }
  registerOnChange(fn: (v: unknown) => void): void {
    this.onChange = fn;
  }
  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }
  setDisabledState(isDisabled: boolean): void {
    this.cvaDisabled.set(isDisabled);
  }
}

import {
  ChangeDetectionStrategy,
  Component,
  computed,
  forwardRef,
  input,
  signal,
} from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

export interface RadioOption {
  value: unknown;
  label: string;
  description?: string;
  disabled?: boolean;
}

let uid = 0;

/** Radio group CVA — renders one native radio per option. */
@Component({
  selector: 'pera-radio',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    { provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => PeraRadioComponent), multi: true },
  ],
  host: { class: 'block', role: 'radiogroup' },
  template: `
    <div class="flex gap-2" [class.flex-col]="!inline()" [class.flex-wrap]="inline()">
      @for (opt of options(); track $index) {
        <label
          class="inline-flex items-start gap-2 text-sm select-none"
          [class.cursor-pointer]="!isDisabled() && !opt.disabled"
          [class.opacity-45]="isDisabled() || opt.disabled"
        >
          <input
            type="radio"
            [name]="groupName"
            class="w-4 h-4 mt-0.5 accent-[var(--color-accent)] outline-none
                   focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2"
            [checked]="opt.value === value()"
            [disabled]="isDisabled() || opt.disabled"
            (change)="pick(opt)"
            (blur)="onTouched()"
          />
          <span class="flex flex-col gap-0.5">
            <span>{{ opt.label }}</span>
            @if (opt.description) {
              <span class="text-xs text-text-muted">{{ opt.description }}</span>
            }
          </span>
        </label>
      }
    </div>
  `,
})
export class PeraRadioComponent implements ControlValueAccessor {
  readonly options = input<RadioOption[]>([]);
  readonly inline = input(false);
  readonly disabled = input(false);

  readonly groupName = `pera-radio-${++uid}`;
  readonly value = signal<unknown>(null);
  private readonly cvaDisabled = signal(false);
  readonly isDisabled = computed(() => this.disabled() || this.cvaDisabled());

  onChange: (v: unknown) => void = () => {};
  onTouched: () => void = () => {};

  pick(opt: RadioOption): void {
    this.value.set(opt.value);
    this.onChange(opt.value);
  }

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

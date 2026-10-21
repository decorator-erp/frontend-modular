import {
  ChangeDetectionStrategy,
  Component,
  computed,
  forwardRef,
  input,
  signal,
} from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

@Component({
  selector: 'pera-checkbox',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => PeraCheckboxComponent),
      multi: true,
    },
  ],
  host: { class: 'inline-flex' },
  template: `
    <label
      class="inline-flex items-center gap-2 text-sm select-none"
      [class.cursor-pointer]="!isDisabled()"
      [class.opacity-45]="isDisabled()"
      [class.cursor-not-allowed]="isDisabled()"
    >
      <input
        type="checkbox"
        class="w-4 h-4 accent-[var(--color-accent)] outline-none
               focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2"
        [checked]="checked()"
        [disabled]="isDisabled()"
        [indeterminate]="indeterminate()"
        (change)="onToggle($event)"
        (blur)="onTouched()"
      />
      <ng-content />
    </label>
  `,
})
export class PeraCheckboxComponent implements ControlValueAccessor {
  readonly disabled = input(false);
  readonly indeterminate = input(false);

  readonly checked = signal(false);
  private readonly cvaDisabled = signal(false);
  readonly isDisabled = computed(() => this.disabled() || this.cvaDisabled());

  onChange: (v: boolean) => void = () => {};
  onTouched: () => void = () => {};

  onToggle(event: Event): void {
    const v = (event.target as HTMLInputElement).checked;
    this.checked.set(v);
    this.onChange(v);
  }

  writeValue(v: unknown): void {
    this.checked.set(!!v);
  }
  registerOnChange(fn: (v: boolean) => void): void {
    this.onChange = fn;
  }
  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }
  setDisabledState(isDisabled: boolean): void {
    this.cvaDisabled.set(isDisabled);
  }
}

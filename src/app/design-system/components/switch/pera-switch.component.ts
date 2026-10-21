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
  selector: 'pera-switch',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    { provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => PeraSwitchComponent), multi: true },
  ],
  host: { class: 'inline-flex' },
  template: `
    <label
      class="inline-flex items-center gap-2 text-sm select-none"
      [class.cursor-pointer]="!isDisabled()"
      [class.opacity-45]="isDisabled()"
      [class.cursor-not-allowed]="isDisabled()"
    >
      <button
        type="button"
        role="switch"
        [attr.aria-checked]="checked()"
        [disabled]="isDisabled()"
        class="relative w-9 h-5 rounded-full transition-colors outline-none shrink-0
               focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2"
        [class.bg-accent]="checked()"
        [class.bg-border-strong]="!checked()"
        (click)="toggleValue()"
        (blur)="onTouched()"
      >
        <span
          class="absolute top-0.5 start-0.5 w-4 h-4 rounded-full bg-surface shadow-sm transition-transform
                 rtl:-translate-x-0"
          [class.translate-x-4]="checked()"
          [class.rtl:-translate-x-4]="checked()"
          aria-hidden="true"
        ></span>
      </button>
      <ng-content />
    </label>
  `,
})
export class PeraSwitchComponent implements ControlValueAccessor {
  readonly disabled = input(false);

  readonly checked = signal(false);
  private readonly cvaDisabled = signal(false);
  readonly isDisabled = computed(() => this.disabled() || this.cvaDisabled());

  onChange: (v: boolean) => void = () => {};
  onTouched: () => void = () => {};

  toggleValue(): void {
    if (this.isDisabled()) return;
    this.checked.update((v) => !v);
    this.onChange(this.checked());
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

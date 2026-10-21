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
  selector: 'pera-textarea',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => PeraTextareaComponent),
      multi: true,
    },
  ],
  host: { class: 'block w-full' },
  template: `
    <textarea
      [value]="value()"
      [placeholder]="placeholder()"
      [disabled]="isDisabled()"
      [readonly]="readonly()"
      [rows]="rows()"
      [attr.aria-invalid]="error() ? 'true' : null"
      [class]="classes()"
      (input)="onInput($event)"
      (blur)="onTouched()"
    ></textarea>
  `,
})
export class PeraTextareaComponent implements ControlValueAccessor {
  readonly placeholder = input('');
  readonly disabled = input(false);
  readonly readonly = input(false);
  readonly rows = input(3);
  readonly error = input<string | undefined>(undefined);

  readonly value = signal('');
  private readonly cvaDisabled = signal(false);
  readonly isDisabled = computed(() => this.disabled() || this.cvaDisabled());

  readonly classes = computed(() =>
    [
      'w-full px-3 py-2 bg-surface text-text-primary border rounded-sm outline-none text-sm resize-y',
      'placeholder:text-text-muted',
      'focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2',
      this.error() ? 'border-danger' : 'border-border',
      this.isDisabled() ? 'opacity-45 cursor-not-allowed bg-surface-muted' : '',
    ].join(' '),
  );

  onChange: (v: string) => void = () => {};
  onTouched: () => void = () => {};

  onInput(event: Event): void {
    const v = (event.target as HTMLTextAreaElement).value;
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

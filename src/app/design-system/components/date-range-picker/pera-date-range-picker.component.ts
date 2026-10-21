import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  forwardRef,
  input,
  output,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  ControlValueAccessor,
  FormControl,
  NG_VALUE_ACCESSOR,
  ReactiveFormsModule,
} from '@angular/forms';
import { merge } from 'rxjs';
import { PeraDateInputComponent } from '../date-input/pera-date-input.component';

/** ControlValueAccessor surface for the range picker. */
export interface DateRange {
  start: Date | null;
  end: Date | null;
}

/** A clickable quick-range shortcut (e.g. "Last 7 days"). */
export interface DateRangePreset {
  label: string;
  range: { start: Date; end: Date };
}

/** Render mode: the editable two-field control, or a static display pill. */
export type DateRangePickerMode = 'input' | 'pill';

/**
 * Two-ended date range control built on two `pera-date-input`s. The CVA value
 * is a `{ start, end }` pair of `Date | null` — the JS Date boundary the app's
 * date filters expect, while each inner input keeps its own ISO `YYYY-MM-DD`
 * string surface internally.
 *
 * Optional `presets` render as quick-range buttons below the inputs; picking one
 * fills both dates and notifies the form. Every change (typed or preset) both
 * emits `rangeChange` and drives the parent `formControl` via the CVA `onChange`.
 *
 * ## `mode="pill"`
 *
 * A **static, non-interactive** display of the current range, matching the
 * dashboards prototype's `.dr` element:
 *
 * ```html
 * <pera-date-range-picker mode="pill" presetLabel="Period" />
 * <!-- Period · Q2 2026 · Apr 1 – Jun 16 ▾ -->
 * ```
 *
 * The prototype's pill has `cursor: pointer` and a hover state but no dropdown
 * markup and no handler — it only looks clickable. This mode mirrors that: it
 * emits nothing (no `rangeChange`, no CVA `onChange`), takes no focus, is not a
 * `<button>`, and ignores `presets` / `min` / `max` / `error`. `mode="input"`
 * behaviour is unchanged.
 */
@Component({
  selector: 'pera-date-range-picker',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PeraDateInputComponent, ReactiveFormsModule],
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => PeraDateRangePickerComponent),
      multi: true,
    },
  ],
  host: { class: 'block' },
  template: `
    @if (mode() === 'pill') {
      <div
        class="inline-flex items-center gap-2 px-3 py-1 border border-border bg-surface
               text-text-primary cursor-pointer transition-colors hover:bg-surface-muted"
      >
        @if (presetLabel(); as label) {
          <span class="text-text-muted" [style.fontSize]="'var(--fs-micro)'">{{ label }}</span>
        }
        <span class="tabular-nums" [style.fontSize]="'var(--fs-label)'">{{ pillValue() }}</span>
        <span class="text-text-muted" [style.fontSize]="'var(--fs-micro)'" aria-hidden="true"
          >▾</span
        >
      </div>
    } @else {
      <div class="flex flex-col gap-2" (focusout)="onTouched()">
        <div class="flex items-center gap-2">
          <pera-date-input
            class="flex-1"
            [formControl]="startCtrl"
            [size]="size()"
            [min]="min()"
            [max]="max()"
            [error]="error()"
          />
          <span class="text-text-muted select-none" aria-hidden="true">–</span>
          <pera-date-input
            class="flex-1"
            [formControl]="endCtrl"
            [size]="size()"
            [min]="min()"
            [max]="max()"
            [error]="error()"
          />
        </div>
        @if (presets().length) {
          <div class="flex flex-wrap gap-2">
            @for (preset of presets(); track $index) {
              <button
                type="button"
                [disabled]="isDisabled()"
                (click)="applyPreset(preset)"
                class="text-xs px-2 py-1 rounded-md border border-border text-text-secondary cursor-pointer
                       hover:bg-surface-muted outline-none focus-visible:outline-2 focus-visible:outline-accent
                       focus-visible:outline-offset-2 disabled:opacity-45 disabled:cursor-not-allowed"
              >
                {{ preset.label }}
              </button>
            }
          </div>
        }
      </div>
    }
  `,
})
export class PeraDateRangePickerComponent implements ControlValueAccessor {
  /** `'input'` (default) is the editable control; `'pill'` is a static display. */
  readonly mode = input<DateRangePickerMode>('input');
  /** Pill mode only: the muted leading label, e.g. `Period`. */
  readonly presetLabel = input<string | undefined>(undefined);
  /** Quick-range shortcuts rendered as buttons. Ignored in pill mode. */
  readonly presets = input<DateRangePreset[]>([]);
  /** ISO `YYYY-MM-DD` lower bound forwarded to both inputs. */
  readonly min = input<string | null>(null);
  /** ISO `YYYY-MM-DD` upper bound forwarded to both inputs. */
  readonly max = input<string | null>(null);
  readonly size = input<'sm' | 'md' | 'lg'>('md');
  readonly error = input<string | undefined>(undefined);
  readonly disabled = input(false);

  readonly rangeChange = output<DateRange>();

  // Inner ISO-string surfaces — each wraps one `pera-date-input`.
  protected readonly startCtrl = new FormControl('', { nonNullable: true });
  protected readonly endCtrl = new FormControl('', { nonNullable: true });

  private readonly cvaDisabled = signal(false);
  protected readonly isDisabled = computed(() => this.disabled() || this.cvaDisabled());

  /** Mirrors the current range so pill mode can render it without a form. */
  private readonly range = signal<DateRange>({ start: null, end: null });

  /** `Apr 1 – Jun 16`, or an em dash when no range is set. Pill mode only. */
  protected readonly pillValue = computed<string>(() => {
    const { start, end } = this.range();
    if (!start && !end) return '—';
    const label = (d: Date | null) =>
      d ? d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '…';
    return `${label(start)} – ${label(end)}`;
  });

  private onChange: (v: DateRange) => void = () => {};
  protected onTouched: () => void = () => {};

  constructor() {
    // Typed edits on either input rebuild and publish the pair.
    merge(this.startCtrl.valueChanges, this.endCtrl.valueChanges)
      .pipe(takeUntilDestroyed())
      .subscribe(() => this.emit());

    // Keep both inner inputs' enabled state in lockstep with the control.
    effect(() => {
      const disabled = this.isDisabled();
      const opts = { emitEvent: false } as const;
      if (disabled) {
        this.startCtrl.disable(opts);
        this.endCtrl.disable(opts);
      } else {
        this.startCtrl.enable(opts);
        this.endCtrl.enable(opts);
      }
    });
  }

  protected applyPreset(preset: DateRangePreset): void {
    if (this.isDisabled()) return;
    this.startCtrl.setValue(this.toIso(preset.range.start), { emitEvent: false });
    this.endCtrl.setValue(this.toIso(preset.range.end), { emitEvent: false });
    this.emit();
  }

  private emit(): void {
    const value = this.currentValue();
    this.range.set(value);
    // Pill mode is a static display: it never notifies a form or a parent.
    if (this.mode() === 'pill') return;
    this.onChange(value);
    this.rangeChange.emit(value);
  }

  private currentValue(): DateRange {
    return {
      start: this.parse(this.startCtrl.value),
      end: this.parse(this.endCtrl.value),
    };
  }

  /** ISO `YYYY-MM-DD` → local `Date` (or null). Component-wise parse avoids the
   *  UTC day-shift that `new Date('YYYY-MM-DD')` introduces. */
  private parse(iso: string | null | undefined): Date | null {
    if (!iso) return null;
    const [y, m, d] = iso.split('-').map(Number);
    if (!y || !m || !d) return null;
    return new Date(y, m - 1, d);
  }

  /** Local `Date` → ISO `YYYY-MM-DD` (empty string when null). Local getters
   *  keep the calendar day stable across time zones. */
  private toIso(date: Date | null): string {
    if (!date) return '';
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  // ControlValueAccessor -----------------------------------------------------

  writeValue(value: DateRange | null | undefined): void {
    this.startCtrl.setValue(this.toIso(value?.start ?? null), { emitEvent: false });
    this.endCtrl.setValue(this.toIso(value?.end ?? null), { emitEvent: false });
    // `emitEvent: false` bypasses emit(); keep the pill's mirror in step.
    this.range.set({ start: value?.start ?? null, end: value?.end ?? null });
  }
  registerOnChange(fn: (v: DateRange) => void): void {
    this.onChange = fn;
  }
  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }
  setDisabledState(isDisabled: boolean): void {
    this.cvaDisabled.set(isDisabled);
  }
}

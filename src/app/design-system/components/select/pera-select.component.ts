import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  forwardRef,
  inject,
  input,
  signal,
} from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { CdkConnectedOverlay, CdkOverlayOrigin } from '@angular/cdk/overlay';
import { PeraIconComponent } from '../icon/pera-icon.component';

export interface SelectOption {
  value: unknown;
  label: string;
  disabled?: boolean;
}

/**
 * `field` (default) is the full-width form control. `chip` is the compact,
 * content-sized dropdown chip from the hubs prototype (`.selc`): 32px tall,
 * hugging its label, with a small trailing chevron. Used by `pera-filter-bar`.
 */
export type SelectVariant = 'field' | 'chip';

/** Minimum panel width for a chip trigger, which is far narrower than its options. */
const CHIP_PANEL_MIN_WIDTH = 180;

@Component({
  selector: 'pera-select',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PeraIconComponent, CdkConnectedOverlay, CdkOverlayOrigin],
  providers: [
    { provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => PeraSelectComponent), multi: true },
  ],
  // The host must NOT hard-code `block w-full`: a consumer's width utility would
  // lose to it (Tailwind emits `w-full` last), which is what made every
  // `pera-filter-bar` control stretch and wrap onto its own row.
  host: {
    '[class.block]': "variant() === 'field'",
    '[class.w-full]': "variant() === 'field'",
    '[class.inline-flex]': "variant() === 'chip'",
  },
  template: `
    <button
      type="button"
      cdkOverlayOrigin
      #origin="cdkOverlayOrigin"
      [disabled]="isDisabled()"
      [class]="classes()"
      [attr.aria-invalid]="error() ? 'true' : null"
      [attr.aria-label]="accessibleName()"
      aria-haspopup="listbox"
      [attr.aria-expanded]="open()"
      (click)="toggle()"
      (keydown)="onKeydown($event)"
      (blur)="onTouched()"
    >
      <span [class.truncate]="variant() === 'field'" [class.text-text-muted]="!selectedLabel()">
        {{ selectedLabel() || placeholder() }}
      </span>
      @if (variant() === 'chip') {
        <span class="text-text-muted fs-micro" aria-hidden="true">▾</span>
      } @else {
        <pera-icon name="chevron-down" [size]="14" class="text-text-muted ms-auto" />
      }
    </button>

    <ng-template
      cdkConnectedOverlay
      [cdkConnectedOverlayOrigin]="origin"
      [cdkConnectedOverlayOpen]="open()"
      [cdkConnectedOverlayMinWidth]="panelWidth()"
      [cdkConnectedOverlayHasBackdrop]="true"
      cdkConnectedOverlayBackdropClass="cdk-overlay-transparent-backdrop"
      (backdropClick)="close()"
      (detach)="close()"
      (overlayKeydown)="onKeydown($event)"
    >
      <div
        class="bg-surface border border-border rounded-sm shadow-md py-1 max-h-64 overflow-auto min-w-full"
        role="listbox"
      >
        @for (opt of options(); track $index) {
          <button
            type="button"
            role="option"
            [attr.aria-selected]="isSelected(opt)"
            [disabled]="opt.disabled"
            class="w-full text-start px-3 py-1.5 text-sm flex items-center gap-2 cursor-pointer
                   hover:bg-surface-muted disabled:opacity-45 disabled:cursor-not-allowed"
            [class.bg-accent-soft]="$index === activeIndex()"
            [class.text-accent]="isSelected(opt)"
            (click)="pick(opt)"
          >
            <span class="truncate flex-1">{{ opt.label }}</span>
            @if (isSelected(opt)) {
              <pera-icon name="check" [size]="14" />
            }
          </button>
        } @empty {
          <div class="px-3 py-2 text-sm text-text-muted">No options</div>
        }
      </div>
    </ng-template>
  `,
})
export class PeraSelectComponent implements ControlValueAccessor {
  private readonly host = inject(ElementRef<HTMLElement>);

  readonly options = input<SelectOption[]>([]);
  readonly placeholder = input('Select…');
  readonly disabled = input(false);
  readonly error = input<string | undefined>(undefined);
  /** Accessible name for a control with no visible label (e.g. a grid cell). */
  readonly ariaLabel = input<string | undefined>(undefined);
  readonly size = input<'sm' | 'md' | 'lg'>('md');
  /** `field` = full-width form control (default). `chip` = the prototype's `.selc`. */
  readonly variant = input<SelectVariant>('field');

  readonly value = signal<unknown>(null);
  readonly open = signal(false);
  readonly activeIndex = signal(-1);
  private readonly cvaDisabled = signal(false);
  readonly isDisabled = computed(() => this.disabled() || this.cvaDisabled());

  /**
   * With an `ariaLabel`, the button's name would otherwise replace its content (the selected
   * value), so the value is appended: "<label>: <value or placeholder>". Unset → no attribute,
   * and the name stays the visible content.
   */
  readonly accessibleName = computed(() => {
    const label = this.ariaLabel();
    return label ? `${label}: ${this.selectedLabel() || this.placeholder()}` : null;
  });

  readonly selectedLabel = computed(() => {
    const v = this.value();
    return this.options().find((o) => o.value === v)?.label ?? '';
  });

  readonly classes = computed(() => {
    const disabled = this.isDisabled()
      ? 'opacity-45 cursor-not-allowed bg-surface-muted pointer-events-none'
      : '';

    // The prototype's `.selc`: content-sized, 32px tall, muted label + ▾ chevron.
    if (this.variant() === 'chip') {
      return [
        'inline-flex items-center gap-2 h-8 px-2.5 whitespace-nowrap cursor-pointer',
        'bg-surface text-text-secondary border outline-none fs-caption',
        'hover:bg-hover focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2',
        this.error() ? 'border-danger' : 'border-border-strong',
        disabled,
      ].join(' ');
    }

    return [
      'w-full px-3 bg-surface text-text-primary border rounded-sm outline-none',
      'inline-flex items-center gap-2 text-start cursor-pointer',
      'focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2',
      this.size() === 'sm'
        ? 'h-7 fs-body-sm'
        : this.size() === 'lg'
          ? 'h-10 text-sm'
          : 'h-8 text-sm',
      this.error() ? 'border-danger' : 'border-border',
      disabled,
    ].join(' ');
  });

  /** A chip trigger is narrower than its options, so the panel gets a floor. */
  panelWidth(): number {
    const width = this.host.nativeElement.getBoundingClientRect().width;
    return this.variant() === 'chip' ? Math.max(width, CHIP_PANEL_MIN_WIDTH) : width;
  }

  toggle(): void {
    if (this.isDisabled()) return;
    this.open() ? this.close() : this.openPanel();
  }

  openPanel(): void {
    this.activeIndex.set(this.options().findIndex((o) => this.isSelected(o)));
    this.open.set(true);
  }

  close(): void {
    this.open.set(false);
    this.onTouched();
  }

  isSelected(opt: SelectOption): boolean {
    return opt.value === this.value();
  }

  pick(opt: SelectOption): void {
    if (opt.disabled) return;
    this.value.set(opt.value);
    this.onChange(opt.value);
    this.close();
  }

  onKeydown(event: KeyboardEvent): void {
    const opts = this.options();
    switch (event.key) {
      case 'Escape':
        if (this.open()) {
          event.preventDefault();
          this.close();
        }
        break;
      case 'ArrowDown':
        event.preventDefault();
        if (!this.open()) {
          this.openPanel();
          break;
        }
        this.activeIndex.update((i) => Math.min(i + 1, opts.length - 1));
        break;
      case 'ArrowUp':
        event.preventDefault();
        if (!this.open()) {
          this.openPanel();
          break;
        }
        this.activeIndex.update((i) => Math.max(i - 1, 0));
        break;
      case 'Enter':
        if (this.open()) {
          event.preventDefault();
          const opt = opts[this.activeIndex()];
          if (opt) this.pick(opt);
        }
        break;
    }
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

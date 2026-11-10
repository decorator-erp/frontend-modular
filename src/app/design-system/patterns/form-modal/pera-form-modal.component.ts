import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { A11yModule } from '@angular/cdk/a11y';
import { PeraIconComponent } from '../../components/icon/pera-icon.component';
import { PeraModalRef } from '../modal/modal.service';

const WIDTHS = { sm: 440, md: 560, lg: 620, xl: 760 } as const;

/**
 * `PeraFormModalComponent` — the DMS Forms handoff's create/edit modal shell,
 * built once and reused by every entity form. Renders the design chrome:
 *
 *  - a mono **method + endpoint** eyebrow,
 *  - the **title** + muted **sub** line, with a close (✕),
 *  - an optional **server-error banner** (message + mono code),
 *  - the field grid (projected `<ng-content>`), and
 *  - a footer: a **permission note** (lock + `PERM.*`), Cancel, and the primary
 *    submit (spinner + disabled while submitting).
 *
 * State-driven, not scenario-driven: the host binds `submitting` / `errorMessage`
 * / `permissionDenied` from the real form + request lifecycle. Square corners,
 * hairline borders, the one allowed shadow (overlay), tokens only.
 */
@Component({
  selector: 'pera-form-modal',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [A11yModule, PeraIconComponent],
  host: { class: 'block' },
  template: `
    <form
      cdkTrapFocus
      cdkTrapFocusAutoCapture
      novalidate
      (submit)="onSubmit($event)"
      class="bg-surface border border-border rounded-lg shadow-lg flex flex-col max-h-[88vh] max-w-[92vw]"
      [style.width.px]="width()"
      role="dialog"
      aria-modal="true"
      [attr.aria-label]="title()"
    >
      <!-- header -->
      <header
        class="flex items-start gap-3.5 px-[var(--space-5)] py-4 border-b border-border shrink-0"
      >
        <div class="flex-1 min-w-0">
          @if (eyebrow()) {
            <span
              class="inline-block font-mono fs-micro text-accent bg-accent-soft border border-accent px-2 py-px mb-2"
            >
              {{ eyebrow() }}
            </span>
          }
          <h2 class="m-0 text-lg leading-normal font-semibold tracking-[-0.015em]">
            {{ title() }}
          </h2>
          @if (subtitle()) {
            <p class="m-0 mt-1 text-xs text-text-secondary leading-[1.5]">
              {{ subtitle() }}
            </p>
          }
        </div>
        <button
          type="button"
          class="w-icon-lg h-icon-lg inline-flex items-center justify-center border border-border text-text-secondary
                 cursor-pointer shrink-0 hover:bg-surface-muted hover:text-text-primary transition-colors
                 outline-none focus-visible:outline-2 focus-visible:outline-accent"
          aria-label="Close"
          (click)="cancelled.emit()"
        >
          <pera-icon name="x" [size]="14" />
        </button>
      </header>

      <!-- server-error banner -->
      @if (errorMessage()) {
        <div
          class="flex items-start gap-3 mx-[var(--space-5)] mt-4 px-3.5 py-3 border border-danger bg-danger-soft"
          role="alert"
        >
          <pera-icon name="alert-triangle" [size]="16" class="text-danger shrink-0 mt-px" />
          <div class="min-w-0">
            <div class="fs-caption font-medium text-danger">{{ errorMessage() }}</div>
            @if (errorCode()) {
              <div class="font-mono fs-label text-danger/80 mt-1">{{ errorCode() }}</div>
            }
          </div>
        </div>
      }

      <!-- body -->
      <div class="px-[var(--space-5)] py-5 overflow-auto">
        <ng-content />
      </div>

      <!-- footer -->
      <footer
        class="flex items-center gap-3.5 px-[var(--space-5)] py-3.5 border-t border-border shrink-0"
      >
        @if (permission()) {
          <div
            class="flex items-center gap-2 min-w-0 fs-label"
            [class.text-text-muted]="!permissionDenied()"
            [class.text-danger]="permissionDenied()"
          >
            <pera-icon name="lock" [size]="13" class="shrink-0" />
            <span>{{ permissionDenied() ? "You don't have" : 'Requires' }}</span>
            <code
              class="font-mono fs-label bg-surface-muted border border-border px-1 py-px"
              [class.text-text-secondary]="!permissionDenied()"
              [class.text-danger]="permissionDenied()"
              >{{ permission() }}</code
            >
          </div>
        }
        <span class="flex-1"></span>
        <button
          type="button"
          class="inline-flex items-center justify-center px-4 py-2 fs-body-sm font-medium border border-border-strong
                 bg-surface text-text-primary cursor-pointer hover:bg-surface-muted transition-colors
                 outline-none focus-visible:outline-2 focus-visible:outline-accent"
          (click)="cancelled.emit()"
        >
          {{ cancelLabel() }}
        </button>
        <button
          type="submit"
          class="inline-flex items-center justify-center gap-2 px-4 py-2 fs-body-sm font-medium border border-accent
                 bg-accent text-on-accent cursor-pointer hover:bg-accent-hover transition-colors
                 outline-none focus-visible:outline-2 focus-visible:outline-accent
                 disabled:opacity-45 disabled:cursor-not-allowed"
          [disabled]="submitting() || permissionDenied() || submitDisabled()"
        >
          @if (submitting()) {
            <span
              class="w-icon-xs h-icon-xs border-2 border-on-accent/45 border-t-on-accent rounded-full animate-spin"
              aria-hidden="true"
            ></span>
          }
          {{ submitting() ? submittingLabel() || submitLabel() : submitLabel() }}
        </button>
      </footer>
    </form>
  `,
})
export class PeraFormModalComponent {
  private readonly modalRef = inject(PeraModalRef, { optional: true });

  /** Mono method + endpoint eyebrow, e.g. "POST /api/project-tasks". */
  readonly eyebrow = input('');
  readonly title = input('');
  readonly subtitle = input('');
  readonly size = input<'sm' | 'md' | 'lg' | 'xl'>('lg');

  /** Footer permission note — the required PERM.* code. */
  readonly permission = input('');
  /** When the viewer lacks the perm: red note + disabled submit (the design's "No access"). */
  readonly permissionDenied = input(false);

  readonly cancelLabel = input('Cancel');
  readonly submitLabel = input('Save');
  readonly submittingLabel = input('');
  readonly submitting = input(false);
  readonly submitDisabled = input(false);

  /** Server-error banner (RFC-7807): human message + mono code. */
  readonly errorMessage = input<string | null>(null);
  readonly errorCode = input<string | null>(null);

  readonly submitted = output<void>();
  /**
   * The ✕ and Cancel both emit this. Hosts bind it to close with their own
   * result (e.g. `false`); if unhandled it still dismisses the overlay so the
   * shell is safe to drop in standalone.
   */
  readonly cancelled = output<void>();

  readonly width = computed(() => WIDTHS[this.size()]);

  constructor() {
    this.cancelled.subscribe(() => queueMicrotask(() => this.modalRef?.close()));
  }

  /** Native form submit (button type=submit / Enter) — never reload the page. */
  onSubmit(event: Event): void {
    event.preventDefault();
    this.submitted.emit();
  }
}

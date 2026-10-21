import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Toast, ToastService, ToastTone } from '@platform/feedback/toast.service';
import { PeraIconComponent } from '../../components/icon/pera-icon.component';

const TONE_ICON: Record<ToastTone, string> = {
  info: 'info',
  success: 'check-circle',
  warning: 'alert-triangle',
  danger: 'alert-circle',
};

const TONE_TEXT: Record<ToastTone, string> = {
  info: 'text-info',
  success: 'text-success',
  warning: 'text-warning',
  danger: 'text-danger',
};

const TONE_EDGE: Record<ToastTone, string> = {
  info: 'border-s-info',
  success: 'border-s-success',
  warning: 'border-s-warning',
  danger: 'border-s-danger',
};

/**
 * Toast stack. `aria-live="polite"` announces toasts without interrupting (FR-028). A toast with
 * an `action` renders an activatable body (click/Enter → run + dismiss); it is keyboard-reachable
 * but is NEVER programmatically focused, so it does not steal focus on arrival (FR-024/A1).
 */
@Component({
  selector: 'pera-toast-container',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PeraIconComponent],
  template: `
    <div
      class="fixed top-4 end-4 z-50 flex flex-col gap-2 w-80 max-w-[calc(100vw-2rem)] pointer-events-none"
      aria-live="polite"
    >
      @for (toast of toasts.items(); track toast.id) {
        <div
          class="pointer-events-auto flex items-start gap-2.5 px-3 py-2.5 rounded-md shadow-md
                 bg-surface border border-border border-s-4 {{ edge(toast.tone) }}"
          role="status"
        >
          <pera-icon [name]="icon(toast.tone)" [size]="16" class="mt-0.5 {{ text(toast.tone) }}" />

          @if (toast.action) {
            <button
              type="button"
              class="flex-1 min-w-0 text-start cursor-pointer outline-none
                     focus-visible:outline-2 focus-visible:outline-accent"
              (click)="activate(toast)"
            >
              @if (toast.title) {
                <span class="block text-sm font-medium text-text-primary">{{ toast.title }}</span>
              }
              <span class="block text-sm leading-snug text-text-secondary">{{
                toast.message
              }}</span>
            </button>
          } @else {
            <div class="flex-1 min-w-0">
              @if (toast.title) {
                <span class="block text-sm font-medium text-text-primary">{{ toast.title }}</span>
              }
              <span class="block text-sm leading-snug text-text-primary">{{ toast.message }}</span>
            </div>
          }

          <button
            type="button"
            class="inline-flex p-0.5 rounded-sm text-text-muted hover:text-text-primary cursor-pointer
                   outline-none focus-visible:outline-2 focus-visible:outline-accent"
            aria-label="Dismiss"
            (click)="toasts.dismiss(toast.id)"
          >
            <pera-icon name="x" [size]="14" />
          </button>
        </div>
      }
    </div>
  `,
})
export class PeraToastContainerComponent {
  readonly toasts = inject(ToastService);

  activate(toast: Toast): void {
    toast.action?.run();
    this.toasts.dismiss(toast.id);
  }

  icon(tone: ToastTone): string {
    return TONE_ICON[tone];
  }
  text(tone: ToastTone): string {
    return TONE_TEXT[tone];
  }
  edge(tone: ToastTone): string {
    return TONE_EDGE[tone];
  }
}

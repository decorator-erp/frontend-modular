import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

export type StatusBadgeTone = 'success' | 'warning' | 'error' | 'info' | 'pending' | 'neutral';

const TONE_CLASSES: Record<StatusBadgeTone, string> = {
  success: 'bg-success-soft text-success',
  warning: 'bg-warning-soft text-warning',
  error: 'bg-danger-soft text-danger',
  info: 'bg-info-soft text-info',
  pending: 'bg-pending-soft text-pending',
  neutral: 'bg-surface-muted text-text-secondary',
};

/**
 * `pera-status-badge` — an inline status pill with a subtle tinted background,
 * matching text colour, an optional decorative dot, and a meaningful label.
 *
 * Meaning is always carried by the `label` text (never colour alone); the dot
 * is purely decorative (`aria-hidden`).
 */
@Component({
  selector: 'pera-status-badge',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'inline-flex' },
  template: `
    <span [class]="classes()">
      @if (dot()) {
        <span
          data-dot
          class="h-1.5 w-1.5 rounded-full bg-current shrink-0"
          aria-hidden="true"
        ></span>
      }
      <span>{{ label() }}</span>
    </span>
  `,
})
export class PeraStatusBadgeComponent {
  readonly tone = input<StatusBadgeTone>('neutral');
  readonly label = input.required<string>();
  /** RD-1 soft filled badges: no dot by default (the fill carries the state). */
  readonly dot = input(false);

  readonly classes = computed(() =>
    [
      'inline-flex items-center gap-1.5 px-2.5 py-0.5 text-xs font-medium whitespace-nowrap rounded-full',
      TONE_CLASSES[this.tone()],
    ].join(' '),
  );
}

import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

export type AlertTone = 'info' | 'success' | 'warning' | 'danger';

const TONE_CLASSES: Record<AlertTone, string> = {
  info: 'border-info bg-info-soft text-info',
  success: 'border-success bg-success-soft text-success',
  warning: 'border-warning bg-warning-soft text-warning',
  danger: 'border-danger bg-danger-soft text-danger',
};

const ROLE_BY_TONE: Record<AlertTone, 'status' | 'alert'> = {
  info: 'status',
  success: 'status',
  warning: 'status',
  danger: 'alert',
};

/**
 * Form-level alert strip. Used for server-error rollups (per
 * `FEATURE_PROMPT_FINANCE_FORMS.md` G0.2 and G2) when no single field control
 * captures the failure.
 *
 * Tone behaviour:
 *   - `info` / `success` / `warning` mount as `role="status"` with
 *     `aria-live="polite"` (announces calmly, doesn't interrupt).
 *   - `danger` mounts as `role="alert"` so assistive tech jumps to it.
 */
@Component({
  selector: 'pera-alert',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'block',
    '[attr.role]': 'role()',
    '[attr.aria-live]': 'tone() === "danger" ? "assertive" : "polite"',
  },
  template: `
    <div [class]="classes()">
      @if (title()) {
        <p class="m-0 fs-body-sm font-semibold leading-tight">{{ title() }}</p>
      }
      <div class="m-0 fs-caption leading-snug">
        <ng-content></ng-content>
      </div>
    </div>
  `,
})
export class PeraAlertComponent {
  readonly tone = input<AlertTone>('info');
  readonly title = input<string | null>(null);

  protected readonly role = computed(() => ROLE_BY_TONE[this.tone()]);

  protected readonly classes = computed(() =>
    ['flex flex-col gap-1.5 border px-3.5 py-2.5', TONE_CLASSES[this.tone()]].join(' '),
  );
}

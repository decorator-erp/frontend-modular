import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

export type HealthState = 'healthy' | 'at-risk' | 'over';
export type HealthIndicatorVariant = 'dot' | 'pill';

const DEFAULT_LABELS: Record<HealthState, string> = {
  healthy: 'Healthy',
  'at-risk': 'At risk',
  over: 'Over budget',
};

/** Tone text colour per state (healthy → success, at-risk → warning, over → danger). */
const TEXT_TONE: Record<HealthState, string> = {
  healthy: 'text-success',
  'at-risk': 'text-warning',
  over: 'text-danger',
};

/** Solid dot fill per state — carries the signal alongside the label, never colour alone. */
const DOT_TONE: Record<HealthState, string> = {
  healthy: 'bg-success',
  'at-risk': 'bg-warning',
  over: 'bg-danger',
};

/** Soft tinted background for the pill variant. */
const PILL_TONE: Record<HealthState, string> = {
  healthy: 'bg-success-soft',
  'at-risk': 'bg-warning-soft',
  over: 'bg-danger-soft',
};

/**
 * `pera-health-indicator` — budget-health status. Renders a coloured DOT plus a
 * text label; the signal is always carried by shape + label, never colour alone.
 *
 * - `dot` variant (default): a small tone-coloured dot next to the label — for
 *   dense rows.
 * - `pill` variant: a soft tinted pill wrapping the dot + label.
 *
 * The host is `role="img"` with an `aria-label` equal to the resolved label so
 * assistive tech reads a single meaningful token.
 */
@Component({
  selector: 'pera-health-indicator',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    role: 'img',
    '[attr.aria-label]': 'resolvedLabel()',
    class: 'inline-flex items-center',
  },
  template: `
    <span [class]="containerClasses()">
      <span data-dot [class]="dotClasses()" aria-hidden="true"></span>
      <span>{{ resolvedLabel() }}</span>
    </span>
  `,
})
export class PeraHealthIndicatorComponent {
  readonly state = input<HealthState>('healthy');
  readonly variant = input<HealthIndicatorVariant>('dot');
  readonly label = input<string>();

  protected readonly resolvedLabel = computed(() => this.label() ?? DEFAULT_LABELS[this.state()]);

  protected readonly containerClasses = computed(() => {
    const base = ['inline-flex items-center gap-1.5 text-xs font-medium', TEXT_TONE[this.state()]];
    if (this.variant() === 'pill') {
      base.push('px-2 py-0.5 rounded-full', PILL_TONE[this.state()]);
    }
    return base.join(' ');
  });

  protected readonly dotClasses = computed(() =>
    ['h-2 w-2 rounded-full shrink-0', DOT_TONE[this.state()]].join(' '),
  );
}

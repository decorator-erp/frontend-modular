import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
// Moved to platform/types/presentation.ts at spec 003-T03 (the shared <-> ds
// tangle resolution) and re-exported here so every DS-internal consumer and
// the barrel stay unchanged.
import type { BadgeTone } from '@platform/types/presentation';

export type { BadgeTone } from '@platform/types/presentation';

const TONE_CLASSES: Record<BadgeTone, string> = {
  neutral: 'bg-surface-muted text-text-secondary',
  success: 'bg-success-soft text-success',
  warning: 'bg-warning-soft text-warning',
  danger: 'bg-danger-soft text-danger',
  info: 'bg-info-soft text-info',
  accent: 'bg-accent-soft text-accent',
};

@Component({
  selector: 'pera-badge',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'inline-flex' },
  template: `
    <span [class]="classes()">
      @if (dot()) {
        <span class="w-1.5 h-1.5 rounded-full bg-current shrink-0" aria-hidden="true"></span>
      }
      <ng-content />
    </span>
  `,
})
export class PeraBadgeComponent {
  readonly tone = input<BadgeTone>('neutral');
  readonly size = input<'sm' | 'micro'>('sm');
  readonly dot = input(false);

  readonly classes = computed(() =>
    [
      'inline-flex items-center gap-1.5 font-medium whitespace-nowrap',
      this.size() === 'sm' ? 'px-2 py-0.5 text-xs rounded-full' : 'px-1.5 py-0.5 fs-label rounded',
      TONE_CLASSES[this.tone()],
    ].join(' '),
  );
}

import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

export type ProgressTone = 'accent' | 'muted' | 'full';

/** A single coloured run inside a multi-segment bar. `value` is a percentage. */
export type SegmentTone = 'ink' | 'muted' | 'accent' | 'success' | 'danger';
export interface ProgressSegment {
  value: number;
  tone: SegmentTone;
}

const SEGMENT_CLASS: Record<SegmentTone, string> = {
  ink: 'bg-text-primary',
  muted: 'bg-text-muted',
  accent: 'bg-accent',
  success: 'bg-success',
  danger: 'bg-danger',
};

/**
 * `.bar` / `.fill` — thin hairline progress bar (2px by default). `tone`
 * picks the fill: accent (default), muted (text-muted) or full (success).
 *
 * Pass `segments` to render several runs side-by-side over the track (e.g. a
 * budget burn bar: committed then actual). When `segments` is non-empty it
 * supersedes `value`/`tone`; otherwise the single-fill behaviour is unchanged.
 */
@Component({
  selector: 'pera-progress-bar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block w-full' },
  template: `
    <div
      class="relative overflow-hidden bg-border-soft"
      role="progressbar"
      [attr.aria-valuenow]="ariaNow()"
      aria-valuemin="0"
      aria-valuemax="100"
      [style.height.px]="height()"
    >
      @if (segments().length) {
        <div class="absolute inset-0 flex">
          @for (s of segments(); track $index) {
            <span [class]="segmentClass(s.tone)" [style.width.%]="clampPct(s.value)"></span>
          }
        </div>
      } @else {
        <span
          class="absolute inset-y-0 start-0"
          [class]="fillClass()"
          [style.width.%]="clamped()"
        ></span>
      }
    </div>
  `,
})
export class PeraProgressBarComponent {
  readonly value = input(0);
  readonly height = input(2);
  readonly tone = input<ProgressTone>('accent');
  readonly segments = input<ProgressSegment[]>([]);

  protected readonly clamped = computed(() => this.clampPct(this.value()));

  protected readonly ariaNow = computed(() => {
    const segs = this.segments();
    if (!segs.length) return this.clamped();
    return this.clampPct(segs.reduce((sum, s) => sum + s.value, 0));
  });

  protected clampPct(v: number): number {
    return Math.min(100, Math.max(0, v));
  }

  protected segmentClass(tone: SegmentTone): string {
    return SEGMENT_CLASS[tone];
  }

  protected readonly fillClass = computed(() => {
    switch (this.tone()) {
      case 'muted':
        return 'bg-text-muted';
      case 'full':
        return 'bg-success';
      default:
        return 'bg-accent';
    }
  });
}

import { ChangeDetectionStrategy, Component, input, output, signal } from '@angular/core';
import { PeraSpinnerComponent } from '../../components/spinner/pera-spinner.component';

export type ChartCardState = 'ready' | 'loading' | 'empty' | 'error';

/**
 * `pera-chart-card` — a PRESENTATIONAL wrapper around a chart. It renders the
 * card chrome (title, period chip, a segmented view control and the state
 * placeholders) and **projects** the chart body; it does NOT depend on any
 * charting library nor render a chart itself.
 *
 * Slots (content projection):
 * - default `<ng-content>` — the canvas / chart body (shown only when `ready`).
 * - `[actions]` — header actions (e.g. a menu / download button).
 * - `[footer]` — footer legend (hidden when empty).
 * - `[tooltipSlot]` — a portal target for charts that render tooltip markup
 *   into the wrapper's own (positioned) stacking context. The wrapper never
 *   renders data tooltips itself.
 *
 * ```html
 * <pera-chart-card
 *   title="Revenue"
 *   period="Last 30 days"
 *   [segments]="['Month', 'Quarter', 'Year']"
 *   [state]="loading() ? 'loading' : 'ready'"
 *   (segmentChange)="onView($event)"
 * >
 *   <button actions pera-button variant="ghost" size="sm">Export</button>
 *   <svg class="w-full h-64"><!-- chart body --></svg>
 *   <div footer class="flex gap-3 text-xs text-text-muted">…legend…</div>
 *   <div tooltipSlot></div>
 * </pera-chart-card>
 * ```
 */
@Component({
  selector: 'pera-chart-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PeraSpinnerComponent],
  host: { class: 'block' },
  template: `
    <section class="relative bg-surface border border-border rounded-lg">
      <!-- Header: always rendered -->
      <div class="flex items-center justify-between gap-2 px-4 py-3 border-b border-border">
        <div class="flex items-center gap-2 min-w-0">
          <h3 class="text-sm font-semibold text-text-primary truncate m-0">{{ title() }}</h3>
          @if (period()) {
            <span
              class="text-xs text-text-muted px-2 py-0.5 rounded-full border border-border shrink-0 whitespace-nowrap"
            >
              {{ period() }}
            </span>
          }
        </div>

        <div class="flex items-center gap-2 shrink-0">
          @if (segments().length) {
            <div class="flex items-center gap-1" role="group" aria-label="Chart views">
              @for (seg of segments(); track seg; let i = $index) {
                <button
                  type="button"
                  class="text-xs px-2 py-1 rounded-md transition-colors cursor-pointer
                         outline-none focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2"
                  [class.bg-selected]="isActive(seg, i)"
                  [class.text-text-primary]="isActive(seg, i)"
                  [class.font-medium]="isActive(seg, i)"
                  [class.text-text-muted]="!isActive(seg, i)"
                  [class.hover:text-text-primary]="!isActive(seg, i)"
                  [attr.aria-pressed]="isActive(seg, i)"
                  (click)="selectSegment(seg)"
                >
                  {{ seg }}
                </button>
              }
            </div>
          }
          <ng-content select="[actions]"></ng-content>
        </div>
      </div>

      <!-- Body: state-driven -->
      <div class="p-4">
        @if (state() === 'loading') {
          <div
            data-loading
            role="status"
            aria-label="Loading chart"
            class="flex items-center justify-center py-12"
          >
            <pera-spinner size="md" tone="accent" />
          </div>
        } @else if (state() === 'empty') {
          <p class="text-sm text-text-muted text-center py-12 m-0">{{ emptyMessage() }}</p>
        } @else if (state() === 'error') {
          <p role="alert" class="text-sm text-danger text-center py-12 m-0">{{ errorMessage() }}</p>
        } @else {
          <ng-content></ng-content>
        }
      </div>

      <!-- Footer legend: hidden when nothing is projected -->
      <div class="px-4 py-3 border-t border-border empty:hidden">
        <ng-content select="[footer]"></ng-content>
      </div>

      <!-- Tooltip portal target: always present, lives in the card's stacking context -->
      <ng-content select="[tooltipSlot]"></ng-content>
    </section>
  `,
})
export class PeraChartCardComponent {
  readonly title = input.required<string>();
  readonly period = input<string | undefined>(undefined);
  readonly segments = input<string[]>([]);
  readonly state = input<ChartCardState>('ready');
  readonly emptyMessage = input('No data to display.');
  readonly errorMessage = input('Something went wrong loading this chart.');

  readonly segmentChange = output<string>();

  private readonly activeSegment = signal<string | null>(null);

  /** The first segment is active by default until the user picks another. */
  protected isActive(seg: string, index: number): boolean {
    const active = this.activeSegment();
    return active === null ? index === 0 : active === seg;
  }

  protected selectSegment(seg: string): void {
    this.activeSegment.set(seg);
    this.segmentChange.emit(seg);
  }
}

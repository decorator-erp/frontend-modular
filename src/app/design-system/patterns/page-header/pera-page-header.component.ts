import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * `.pg` — page/section heading. Two variants:
 *
 *  - `page` (default): the list/index banner — title + count + `[actions]`,
 *    with an optional `[toolbar]` row below.
 *  - `section`: a mono eyebrow caption + hairline rule that fills the remaining
 *    width, for heading sub-sections inside a page (the retired `.sec-title`).
 *
 * ```html
 * <pera-page-header title="Employees" [count]="142">
 *   <pera-button actions variant="primary">Add</pera-button>
 *   <div toolbar class="flex items-center gap-2"> … </div>
 * </pera-page-header>
 *
 * <pera-page-header variant="section" title="Recent activity" />
 * ```
 */
@Component({
  selector: 'pera-page-header',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    @if (variant() === 'section') {
      <div class="flex items-center gap-3">
        <span class="font-mono fs-micro text-text-muted whitespace-nowrap">{{ title() }}</span>
        <span class="flex-1 h-px bg-border" aria-hidden="true"></span>
      </div>
    } @else {
      <!-- RS-1: phone padding; the action row wraps instead of pushing past the screen edge. -->
      <header class="bg-surface border-b border-border px-4 md:px-6 lg:px-8 pt-5 md:pt-7">
        <div class="flex items-center justify-between gap-x-6 gap-y-3 flex-wrap mb-4 md:mb-5">
          <div class="flex items-baseline gap-3.5 flex-wrap">
            <h1 class="font-semibold fs-h1 leading-[1.15] tracking-[-0.01em] text-text-primary">
              {{ title() }}
            </h1>
            @if (count() != null) {
              <span class="font-mono fs-label text-text-muted self-center">{{ count() }}</span>
            }
          </div>
          <div class="flex items-center gap-2 flex-wrap min-w-0 max-w-full [&>*]:max-w-full">
            <ng-content select="[actions]"></ng-content>
          </div>
        </div>
        <div class="flex items-center justify-between gap-4 flex-wrap pb-4 empty:hidden">
          <ng-content select="[toolbar]"></ng-content>
        </div>
      </header>
    }
  `,
})
export class PeraPageHeaderComponent {
  readonly title = input.required<string>();
  readonly count = input<number | string | null>(null);
  /** `page` = index banner; `section` = mono eyebrow + hairline rule (the retired sec-title). */
  readonly variant = input<'page' | 'section'>('page');
}

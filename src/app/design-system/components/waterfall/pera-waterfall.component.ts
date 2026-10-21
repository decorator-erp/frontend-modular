import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { MoneyService } from '@shared/ui/money.service';

interface Bar {
  key: string;
  value: string;
  height: number;
  /** Bar style: solid ink / secondary / muted / accent / dashed-outline. */
  tone: 'estimated' | 'allocated' | 'committed' | 'actual' | 'available';
  label: string;
}

/**
 * Budget waterfall — five bars (Estimated · Allocated · Committed · Actual ·
 * Available) scaled to the largest value. Fed straight from a financial block
 * (project or stage scope); money strings are kept intact and only crossed into
 * numbers via `MoneyService` (heights via `percentOf`, labels via
 * `formatCompact`) — never `parseFloat`. Mirrors the DMS dashboards waterfall.
 */
@Component({
  selector: 'pera-waterfall',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <div class="px-5 pt-4 pb-5">
      <div class="grid grid-cols-5 gap-4 items-end h-40">
        @for (b of bars(); track b.key) {
          <div class="flex flex-col justify-end h-full relative">
            <div
              class="w-full relative"
              [class.bg-text-primary]="b.tone === 'estimated'"
              [class.bg-text-secondary]="b.tone === 'allocated'"
              [class.bg-text-muted]="b.tone === 'committed'"
              [class.bg-accent]="b.tone === 'actual'"
              [class.bg-surface]="b.tone === 'available'"
              [class.border]="b.tone === 'available'"
              [class.border-dashed]="b.tone === 'available'"
              [class.border-text-primary]="b.tone === 'available'"
              [style.height.%]="b.height"
            >
              <span
                class="absolute -top-4 inset-x-0 text-center font-mono fs-label font-medium tabular-nums"
                [class.text-success]="b.tone === 'available'"
                [class.text-text-primary]="b.tone !== 'available'"
                >{{ b.value }}</span
              >
            </div>
          </div>
        }
      </div>
      <div class="grid grid-cols-5 gap-4 mt-2 pt-2 border-t border-border-soft">
        @for (b of bars(); track b.key) {
          <span class="text-center font-mono fs-micro text-text-muted">{{ b.label }}</span>
        }
      </div>
    </div>
  `,
})
export class PeraWaterfallComponent {
  private readonly money = inject(MoneyService);

  readonly estimated = input<string>('0');
  readonly allocated = input<string>('0');
  readonly committed = input<string>('0');
  readonly actual = input<string>('0');
  readonly available = input<string>('0');
  readonly currency = input<string>('EGP');

  protected readonly bars = computed<Bar[]>(() => {
    const cur = this.currency();
    const raw: { key: string; value: string; tone: Bar['tone']; label: string }[] = [
      { key: 'est', value: this.estimated(), tone: 'estimated', label: 'Estimated' },
      { key: 'alloc', value: this.allocated(), tone: 'allocated', label: 'Allocated' },
      { key: 'comm', value: this.committed(), tone: 'committed', label: 'Committed' },
      { key: 'act', value: this.actual(), tone: 'actual', label: 'Actual' },
      { key: 'avail', value: this.available(), tone: 'available', label: 'Available' },
    ];
    // Largest magnitude sets the 100% baseline (compare via BigInt, no parseFloat).
    let max = '0';
    for (const r of raw) {
      if (this.money.compare(r.value, max) > 0) max = r.value;
    }
    return raw.map((r) => ({
      key: r.key,
      tone: r.tone,
      label: r.label,
      value: this.money.formatCompact(r.value, cur),
      height: Math.max(2, this.money.percentOf(r.value, max)),
    }));
  });
}

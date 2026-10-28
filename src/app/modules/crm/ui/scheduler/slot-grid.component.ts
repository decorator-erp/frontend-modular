import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { CatalogService } from '@platform/i18n/catalog.service';
import { intlLocale } from '@platform/i18n/intl-locale';
import type { CrmMeeting, FreeSlot } from '../../model';
import { PeraEmptyComponent, PeraIconComponent } from '@ds';
import { buildScheduleDays, ScheduleCell } from './slot-grid.model';

/**
 * The free-slot grid (T051) — server-computed free windows plus the project's existing
 * meeting slots, rendered as day pills (Sun–Thu) over a vertical time list rather than a
 * literal 5-column table: a true grid risks horizontal scroll at phone width (US2
 * scenario 4), and this shape mirrors correctly in RTL for free with no extra work — a
 * flex row's INLINE axis already flips under `dir="rtl"`.
 *
 * States: free (tappable when `interactive`) / held (amber) / booked (struck-through) /
 * unavailable (past or outside office hours — not rendered as a cell at all when free,
 * to avoid implying a slot exists where the server never said so; kept only when it
 * carries booked/held state worth showing).
 *
 * ⚠️ **In RTL the grid mirrors but times stay LTR** (US2 scenario 5) — every time label
 * is wrapped in `dir="ltr"` (a bidi isolate), never left to Unicode's weak-LTR digit
 * handling the prototype relies on.
 */
@Component({
  selector: 'app-crm-slot-grid',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PeraEmptyComponent, PeraIconComponent],
  host: { class: 'block' },
  template: `
    <div class="flex flex-col gap-3">
      <div class="flex gap-1.5 overflow-x-auto pb-1" role="tablist">
        @for (day of days(); track day.dayKey) {
          <button
            type="button"
            role="tab"
            [attr.aria-selected]="day.dayKey === activeDayKey()"
            class="px-3 py-1.5 fs-body-sm whitespace-nowrap border cursor-pointer transition-colors
                   outline-none focus-visible:outline-2 focus-visible:outline-accent"
            [class.bg-accent]="day.dayKey === activeDayKey()"
            [class.text-on-accent]="day.dayKey === activeDayKey()"
            [class.border-accent]="day.dayKey === activeDayKey()"
            [class.bg-surface]="day.dayKey !== activeDayKey()"
            [class.border-border]="day.dayKey !== activeDayKey()"
            [class.text-text-secondary]="day.dayKey !== activeDayKey()"
            (click)="activeDayKey.set(day.dayKey)"
          >
            {{ dayLabel(day.dayKey) }}
          </button>
        }
      </div>

      @if (activeDayCells().length) {
        <ul class="flex flex-col gap-1.5">
          @for (cell of activeDayCells(); track cell.startsAtUtc) {
            <li>
              <button
                type="button"
                class="w-full flex items-center justify-between gap-3 px-3 py-2 border fs-body-sm
                       outline-none focus-visible:outline-2 focus-visible:outline-accent transition-colors"
                [class]="cellClasses(cell)"
                [disabled]="!isTappable(cell)"
                (click)="tap(cell)"
              >
                <span
                  dir="ltr"
                  class="tabular-nums"
                  [class.line-through]="cell.state === 'booked'"
                  >{{ timeRange(cell) }}</span
                >
                <span class="fs-label inline-flex items-center gap-1">
                  @if (multiple() && isSelected(cell)) {
                    <pera-icon name="check" [size]="12" />
                  }
                  {{ stateLabel(cell) }}
                </span>
              </button>
            </li>
          }
        </ul>
      } @else {
        <pera-empty [title]="catalog.t('sched.free')" [description]="catalog.t('sched.sub')" />
      }
    </div>
  `,
})
export class CrmSlotGridComponent {
  protected readonly catalog = inject(CatalogService);

  readonly freeSlots = input<FreeSlot[]>([]);
  readonly meetings = input<CrmMeeting[]>([]);
  /** ISO instant the grid starts scanning from — defaults to "now" at construction. */
  readonly fromUtc = input<string>(new Date().toISOString());
  readonly rangeDays = input(14);
  /** When true, free cells are clickable (the client scheduler, T052). */
  readonly interactive = input(false);
  /**
   * When true, tapping a free cell TOGGLES it into `selectionChange` instead of firing
   * `slotTap` immediately — the propose-slots composer's "pick one or more" (T050).
   */
  readonly multiple = input(false);

  readonly slotTap = output<FreeSlot>();
  readonly selectionChange = output<FreeSlot[]>();

  private readonly selectedKeys = signal<Set<string>>(new Set());

  /**
   * A LIVE clock, not a snapshot — a hold lapsing while the viewer watches must flip
   * the cell back to free on its own (US2 scenario 5 / T054), not wait for a prop to
   * change. Same 30s cadence as `CrmPeriodCardComponent`'s countdown ticker.
   */
  private readonly now = signal(Date.now());
  constructor() {
    const ticker = setInterval(() => this.now.set(Date.now()), 30_000);
    inject(DestroyRef).onDestroy(() => clearInterval(ticker));
  }

  protected readonly days = computed(() =>
    buildScheduleDays(
      this.fromUtc(),
      this.rangeDays(),
      this.freeSlots(),
      this.meetings(),
      this.now(),
    ),
  );

  protected readonly activeDayKey = signal<string | null>(null);

  protected readonly activeDayCells = computed<ScheduleCell[]>(() => {
    const days = this.days();
    const key = this.activeDayKey() ?? days[0]?.dayKey ?? null;
    return days.find((d) => d.dayKey === key)?.cells ?? [];
  });

  protected dayLabel(dayKey: string): string {
    const date = new Date(`${dayKey}T00:00:00Z`);
    return new Intl.DateTimeFormat(intlLocale(this.catalog.locale()), {
      timeZone: 'Africa/Cairo',
      weekday: 'short',
      day: 'numeric',
      month: 'short',
    }).format(date);
  }

  protected timeRange(cell: ScheduleCell): string {
    const fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Africa/Cairo',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
    return `${fmt.format(new Date(cell.startsAtUtc))}–${fmt.format(new Date(cell.endsAtUtc))}`;
  }

  protected stateLabel(cell: ScheduleCell): string {
    switch (cell.state) {
      case 'free':
        return this.interactive()
          ? this.catalog.t('sched.csFreeTap')
          : this.catalog.t('sched.free');
      case 'held':
        return this.catalog.t('sched.held1');
      case 'booked':
        return this.catalog.t('sched.booked1');
      case 'unavailable':
        return '';
    }
  }

  protected isTappable(cell: ScheduleCell): boolean {
    return this.interactive() && cell.state === 'free';
  }

  protected isSelected(cell: ScheduleCell): boolean {
    return this.selectedKeys().has(cell.startsAtUtc);
  }

  protected cellClasses(cell: ScheduleCell): string {
    switch (cell.state) {
      case 'free':
        if (!this.interactive()) return 'bg-success-soft border-success text-success';
        return this.isSelected(cell)
          ? 'bg-accent text-on-accent border-accent cursor-pointer'
          : 'bg-surface border-accent text-accent cursor-pointer hover:bg-accent-soft';
      case 'held':
        return 'bg-warning-soft border-warning text-warning cursor-not-allowed';
      case 'booked':
        return 'bg-surface-muted border-border text-text-muted cursor-not-allowed opacity-70';
      case 'unavailable':
        return 'bg-surface border-border text-text-muted opacity-45 cursor-not-allowed';
    }
  }

  protected tap(cell: ScheduleCell): void {
    if (!this.isTappable(cell)) return;
    const picked: FreeSlot = { startsAtUtc: cell.startsAtUtc, endsAtUtc: cell.endsAtUtc };

    if (!this.multiple()) {
      this.slotTap.emit(picked);
      return;
    }
    const next = new Set(this.selectedKeys());
    if (next.has(cell.startsAtUtc)) {
      next.delete(cell.startsAtUtc);
    } else {
      next.add(cell.startsAtUtc);
    }
    this.selectedKeys.set(next);
    this.selectionChange.emit(
      this.activeAndOtherDaysCells()
        .filter((c) => next.has(c.startsAtUtc))
        .map((c) => ({ startsAtUtc: c.startsAtUtc, endsAtUtc: c.endsAtUtc })),
    );
  }

  /** Selection must survive switching day tabs — scan every day's cells, not just the active one. */
  private activeAndOtherDaysCells(): ScheduleCell[] {
    return this.days().flatMap((d) => d.cells);
  }
}

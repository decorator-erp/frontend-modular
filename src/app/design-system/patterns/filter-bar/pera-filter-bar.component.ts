import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { PeraInputComponent } from '../../components/input/pera-input.component';
import { PeraSelectComponent } from '../../components/select/pera-select.component';
import { PeraChipComponent } from '../../components/chip/pera-chip.component';
import { PeraDateRangePickerComponent } from '../../components/date-range-picker/pera-date-range-picker.component';

/** The complete, immutable filter selection surfaced by `pera-filter-bar`. */
export interface FilterState {
  /** Free-text search term. */
  search?: string;
  /** Selected facet values, keyed by facet id — multiselect per key. */
  facets?: Record<string, string[]>;
  /** Selected date-range boundary (either side may be `null`). */
  dateRange?: { start: Date | null; end: Date | null } | null;
}

/** A single facet column: a labelled `pera-select` of value/label options. */
export interface FilterFacet {
  key: string;
  label: string;
  options: { value: string; label: string }[];
}

/** Internal view-model for one removable active-filter chip. */
interface ActiveChip {
  id: string;
  label: string;
  kind: 'search' | 'facet' | 'dateRange';
  facetKey?: string;
  facetValue?: string;
}

/**
 * `pera-filter-bar` — a composable filtering header built from existing DS
 * primitives: an optional search field (`pera-input`), one `pera-select` per
 * facet (multiselect semantics), and an optional `pera-date-range-picker`.
 *
 * The active selection is echoed beneath the bar as removable `pera-chip`s;
 * clicking a chip removes just that filter, and a "Clear all" text button
 * appears whenever any filter is active. The component is fully controlled —
 * it never mutates `value`, emitting a brand-new `FilterState` on every change.
 *
 * ```html
 * <pera-filter-bar
 *   [search]="true"
 *   [facets]="[{ key: 'status', label: 'Status', options: [{ value: 'open', label: 'Open' }] }]"
 *   [dateRange]="true"
 *   [value]="filters()"
 *   (valueChange)="filters.set($event)"
 *   (clearAll)="filters.set({})"
 * />
 * ```
 */
@Component({
  selector: 'pera-filter-bar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    PeraInputComponent,
    PeraSelectComponent,
    PeraChipComponent,
    PeraDateRangePickerComponent,
  ],
  host: { class: 'block' },
  template: `
    <!-- The prototype's .fbar: one compact flex row — search, then content-sized
         facet chips, then "Clear all" pushed to the inline-end. -->
    <div class="flex flex-wrap items-center gap-2 border border-border bg-surface px-3 py-2.5">
      @if (search()) {
        <pera-input
          [inline]="true"
          class="w-48 shrink-0"
          type="search"
          iconStart="search"
          placeholder="Search…"
          [ngModel]="value().search ?? ''"
          (ngModelChange)="onSearch($event)"
        />
      }

      @for (facet of facets(); track facet.key) {
        <pera-select
          variant="chip"
          [options]="facet.options"
          [placeholder]="facet.label"
          [ngModel]="null"
          (ngModelChange)="onFacetPick(facet.key, $event)"
        />
      }

      @if (dateRange()) {
        <pera-date-range-picker
          [ngModel]="value().dateRange ?? null"
          (ngModelChange)="onDateRange($event)"
        />
      }

      @if (hasActiveFilters()) {
        <button
          type="button"
          class="ms-auto fs-caption text-text-secondary hover:text-text-primary cursor-pointer
                 outline-none focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2"
          (click)="onClearAll()"
        >
          Clear all
        </button>
      }
    </div>

    @if (activeChips().length) {
      <div class="flex flex-wrap gap-1.5 mt-2">
        @for (chip of activeChips(); track chip.id) {
          <pera-chip [on]="true" (toggled)="removeChip(chip)">{{ chip.label }} ×</pera-chip>
        }
      </div>
    }
  `,
})
export class PeraFilterBarComponent {
  /** Show the free-text search field. */
  readonly search = input(false);
  /** Facet columns, each rendered as a `pera-select`. */
  readonly facets = input<FilterFacet[]>([]);
  /** Show the date-range picker. */
  readonly dateRange = input(false);
  /** Current (controlled) filter selection. */
  readonly value = input<FilterState>({});

  /** Emits a new `FilterState` whenever any filter changes. */
  readonly valueChange = output<FilterState>();
  /** Emits when the "Clear all" button is pressed. */
  readonly clearAll = output<void>();

  /** Removable chips derived purely from `value()` + the facet definitions. */
  readonly activeChips = computed<ActiveChip[]>(() => {
    const v = this.value();
    const chips: ActiveChip[] = [];

    if (v.search) {
      chips.push({ id: 'search', label: v.search, kind: 'search' });
    }

    const defs = this.facets();
    const facets = v.facets ?? {};
    for (const key of Object.keys(facets)) {
      const def = defs.find((d) => d.key === key);
      for (const val of facets[key] ?? []) {
        const label = def?.options.find((o) => o.value === val)?.label ?? val;
        chips.push({
          id: `facet:${key}:${val}`,
          label,
          kind: 'facet',
          facetKey: key,
          facetValue: val,
        });
      }
    }

    const dr = v.dateRange;
    if (dr && (dr.start || dr.end)) {
      chips.push({ id: 'dateRange', label: this.formatRange(dr), kind: 'dateRange' });
    }

    return chips;
  });

  /** Whether any filter is currently active. */
  readonly hasActiveFilters = computed(() => this.activeChips().length > 0);

  protected onSearch(term: string): void {
    this.valueChange.emit({ ...this.value(), search: term || undefined });
  }

  protected onFacetPick(key: string, raw: unknown): void {
    if (raw === null || raw === undefined || raw === '') return;
    const val = String(raw);
    const v = this.value();
    const facets = { ...(v.facets ?? {}) };
    const current = facets[key] ? [...facets[key]] : [];
    const idx = current.indexOf(val);
    // Multiselect: first pick adds, re-picking the same value removes it.
    if (idx >= 0) current.splice(idx, 1);
    else current.push(val);
    this.valueChange.emit(this.withFacet(v, key, current));
  }

  protected onDateRange(range: { start: Date | null; end: Date | null }): void {
    const active = range && (range.start || range.end);
    this.valueChange.emit({ ...this.value(), dateRange: active ? range : null });
  }

  protected removeChip(chip: ActiveChip): void {
    const v = this.value();
    switch (chip.kind) {
      case 'search': {
        const next = { ...v };
        delete next.search;
        this.valueChange.emit(next);
        break;
      }
      case 'facet': {
        const key = chip.facetKey!;
        const remaining = (v.facets?.[key] ?? []).filter((x) => x !== chip.facetValue);
        this.valueChange.emit(this.withFacet(v, key, remaining));
        break;
      }
      case 'dateRange': {
        this.valueChange.emit({ ...v, dateRange: null });
        break;
      }
    }
  }

  protected onClearAll(): void {
    this.valueChange.emit({});
    this.clearAll.emit();
  }

  /** Immutable facet update — drops the key entirely when it becomes empty. */
  private withFacet(v: FilterState, key: string, values: string[]): FilterState {
    const facets = { ...(v.facets ?? {}) };
    if (values.length) facets[key] = values;
    else delete facets[key];
    return { ...v, facets };
  }

  private formatRange(dr: { start: Date | null; end: Date | null }): string {
    const fmt = (d: Date | null) => (d ? d.toLocaleDateString() : '…');
    return `${fmt(dr.start)} – ${fmt(dr.end)}`;
  }
}

import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { PeraAvatarComponent } from '../../components/avatar/pera-avatar.component';
import {
  AvatarStackPerson,
  PeraAvatarStackComponent,
} from '../../components/avatar-stack/pera-avatar-stack.component';
import {
  PeraStatusBadgeComponent,
  StatusBadgeTone,
} from '../../components/status-badge/pera-status-badge.component';
import { PeraBadgeComponent } from '../../components/badge/pera-badge.component';
import { PeraKpiTileComponent } from '../kpi-tile/pera-kpi-tile.component';

/** A single KPI shown in the header card's bottom strip. */
export interface EntityHeaderKpi {
  caption: string;
  value: string | number;
  trend?: number;
  /** Small muted suffix beside the value — the prototype's `.kpibar .ki .v .u`. */
  frac?: string;
}

/** A group of people rendered as an overlapping avatar stack with `+N` overflow. */
export interface EntityHeaderMetaPeople {
  people: AvatarStackPerson[];
  max?: number;
}

/**
 * One label/value pair in the header's meta row. The value is either plain text
 * or a team, rendered as a `pera-avatar-stack` (the prototype's `.av-stack`).
 */
export interface EntityHeaderMeta {
  label: string;
  value: string | EntityHeaderMetaPeople;
}

/**
 * `pera-entity-header-card` — the header card for an entity detail page
 * (renamed from the old `project-header`). It renders an avatar, the entity
 * name with an optional kind badge and status badge, a row of small
 * label/value meta pairs, and a responsive 4-up strip of KPI tiles.
 *
 * It composes existing primitives rather than reimplementing them:
 * {@link PeraAvatarComponent}, {@link PeraStatusBadgeComponent},
 * {@link PeraBadgeComponent} and {@link PeraKpiTileComponent}.
 *
 * Page-level actions project into the card's top-right `[headerActions]` slot
 * (the prototype's `.ehc .acts`), so a caller can keep its own permission-gated
 * buttons inside the card rather than beside it.
 *
 * ```html
 * <pera-entity-header-card
 *   kind="project"
 *   name="Riverside Tower"
 *   [avatar]="{ name: 'Riverside Tower' }"
 *   kindBadge="Project"
 *   [status]="{ tone: 'success', label: 'On track' }"
 *   [meta]="[{ label: 'Manager', value: 'A. Hassan' }]"
 *   [kpis]="[{ caption: 'Budget', value: '2.4M', trend: 4.3 }]"
 * >
 *   <button headerActions type="button">Edit</button>
 * </pera-entity-header-card>
 * ```
 */
@Component({
  selector: 'pera-entity-header-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    PeraAvatarComponent,
    PeraAvatarStackComponent,
    PeraStatusBadgeComponent,
    PeraKpiTileComponent,
    PeraBadgeComponent,
  ],
  host: { class: 'block' },
  template: `
    <div class="bg-surface border border-border rounded-lg p-4 flex flex-col gap-4">
      <!-- The row wraps: with many actions they drop to their own line rather than squeezing the
           name and meta (which then truncated to blank). The identity column keeps a minimum width. -->
      <div class="flex flex-wrap items-start gap-4">
        <pera-avatar size="lg" [name]="avatar()?.name ?? name()" [src]="avatar()?.src" />

        <div data-header-identity class="flex flex-col gap-1 min-w-64 flex-1">
          <div class="flex flex-wrap items-center gap-2">
            <span
              class="font-semibold text-text-primary truncate"
              [style.fontSize]="'var(--fs-h2)'"
              [style.lineHeight]="'var(--lh-h2)'"
              >{{ name() }}</span
            >

            @if (nameAr(); as ar) {
              <span class="text-text-muted truncate" [style.fontSize]="'var(--fs-body-sm)'">{{
                ar
              }}</span>
            }

            @if (kindBadge(); as badge) {
              <pera-badge tone="neutral" size="sm">{{ badge }}</pera-badge>
            }

            @if (status(); as s) {
              <pera-status-badge [tone]="s.tone" [label]="s.label" />
            }
          </div>

          @if (meta().length) {
            <div class="flex flex-wrap gap-x-7 gap-y-3 mt-3">
              @for (pair of meta(); track pair.label) {
                <div class="flex flex-col gap-0.5 min-w-0">
                  <span
                    class="uppercase tracking-wide text-text-muted"
                    [style.fontSize]="'var(--fs-label)'"
                    >{{ pair.label }}</span
                  >
                  @if (asPeople(pair.value); as group) {
                    <pera-avatar-stack [people]="group.people" [max]="group.max ?? 4" />
                  } @else {
                    <span
                      class="font-medium text-text-primary truncate"
                      [style.fontSize]="'var(--fs-caption)'"
                      >{{ pair.value }}</span
                    >
                  }
                </div>
              }
            </div>
          }
        </div>

        <div
          data-header-actions
          class="flex flex-wrap items-center justify-end gap-2 max-w-full ms-auto"
        >
          <ng-content select="[headerActions]" />
        </div>
      </div>

      @if (kpis().length) {
        <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
          @for (kpi of kpis(); track kpi.caption) {
            <pera-kpi-tile
              [caption]="kpi.caption"
              [value]="kpi.value"
              [trend]="kpi.trend"
              [frac]="kpi.frac ?? null"
            />
          }
        </div>
      }
    </div>
  `,
})
export class PeraEntityHeaderCardComponent {
  /** The kind of entity this card fronts. */
  readonly kind = input.required<'department' | 'project' | 'employee'>();
  /** The entity's display name (rendered big). */
  readonly name = input.required<string>();
  /** Optional Arabic name rendered muted beside `name` (prototype `.nmrow .ar`). */
  readonly nameAr = input<string | undefined>(undefined);
  /** Optional avatar source; `name` falls back to the card `name`. */
  readonly avatar = input<{ name?: string; src?: string } | undefined>(undefined);
  /** Optional label rendered as a neutral kind badge next to the name. */
  readonly kindBadge = input<string | undefined>(undefined);
  /** Optional status, rendered via `pera-status-badge`. */
  readonly status = input<{ tone: StatusBadgeTone; label: string } | undefined>(undefined);
  /** Small label/value pairs (e.g. Manager, Team, Start date). */
  readonly meta = input<EntityHeaderMeta[]>([]);
  /** A 4-up strip of KPI tiles shown at the bottom. */
  readonly kpis = input<EntityHeaderKpi[]>([]);

  /** Narrows a meta value to a people group, or `null` for plain text. */
  protected asPeople(value: EntityHeaderMeta['value']): EntityHeaderMetaPeople | null {
    return typeof value === 'string' ? null : value;
  }
}

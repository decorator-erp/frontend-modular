import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { CatalogService } from '@platform/i18n/catalog.service';
import { formatCairoDate } from '@platform/i18n/intl-locale';
import { PeraEmptyComponent } from '@ds';

export interface CrmActivityEntry {
  id: string;
  timestampUtc: string;
  /** Pre-composed, catalog-resolved text — this component renders, never composes. */
  label: string;
}

/**
 * The recent-activity card (T038, FR-020). Presentational — the dashboard composes
 * `label` from period and requirement-item events it already has loaded in B1 (leads
 * aren't project-scoped and contacts would need an extra client fetch; both are left
 * out of this run's feed rather than guessed at — see `crm-dashboard.component.ts`).
 */
@Component({
  selector: 'app-crm-activity-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PeraEmptyComponent],
  host: { class: 'block' },
  template: `
    <div class="bg-surface border border-border rounded-card h-full">
      <div class="px-4 py-3 border-b border-border font-semibold text-text-primary">
        {{ catalog.t('common.activity') }}
      </div>
      <div class="p-4">
        @if (entries().length) {
          <ul class="flex flex-col gap-3">
            @for (entry of entries(); track entry.id) {
              <li class="flex items-baseline gap-3 fs-body-sm">
                <span class="text-text-muted fs-label shrink-0" dir="ltr">{{
                  formatDate(entry.timestampUtc)
                }}</span>
                <span class="text-text-primary min-w-0">{{ entry.label }}</span>
              </li>
            }
          </ul>
        } @else {
          <pera-empty [title]="catalog.t('common.activity')" />
        }
      </div>
    </div>
  `,
})
export class CrmActivityListComponent {
  protected readonly catalog = inject(CatalogService);
  readonly entries = input<CrmActivityEntry[]>([]);

  protected formatDate(iso: string): string {
    return formatCairoDate(iso, this.catalog.locale());
  }
}

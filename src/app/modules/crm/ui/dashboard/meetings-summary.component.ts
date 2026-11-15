import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { CatalogService } from '@platform/i18n/catalog.service';
import { PeraEmptyComponent, PeraStatusBadgeComponent, StatusBadgeTone } from '@ds';

export interface CrmMeetingSummaryRow {
  id: string;
  title: string;
  /** Pre-formatted, Cairo-local, bidi-isolated by the caller — e.g. "9 Jul 13:00 · 60m". */
  whenLabel: string;
  typeLabel: string;
  statusLabel: string;
  statusTone: StatusBadgeTone;
}

/**
 * The meetings-summary card (T038, FR-020). Presentational — wired to real data at B2
 * (the B1-backfill note in `crm-dashboard.component.ts`): the dashboard maps
 * `MeetingsStore.agenda()` into `CrmMeetingSummaryRow[]` via the shared
 * `MEETING_TYPE_KEYS` / `MEETING_STATUS_CHIP` vocabulary (`scheduler/meeting-labels.ts`).
 */
@Component({
  selector: 'app-crm-meetings-summary',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PeraEmptyComponent, PeraStatusBadgeComponent],
  host: { class: 'block' },
  template: `
    <div class="bg-surface border border-border rounded-card h-full">
      <div class="px-4 py-3 border-b border-border font-semibold text-text-primary">
        {{ catalog.t('sched.meetings') }}
      </div>
      <div class="p-4">
        @if (rows().length) {
          <div class="overflow-x-auto">
            <table class="w-full fs-body-sm">
              <thead>
                <tr class="text-start text-text-muted fs-label">
                  <th class="text-start font-normal pb-2">{{ catalog.t('sched.meeting') }}</th>
                  <th class="text-start font-normal pb-2">{{ catalog.t('sched.when') }}</th>
                  <th class="text-start font-normal pb-2">{{ catalog.t('common.type') }}</th>
                  <th class="text-start font-normal pb-2">{{ catalog.t('common.status') }}</th>
                </tr>
              </thead>
              <tbody>
                @for (row of rows(); track row.id) {
                  <tr class="border-t border-border">
                    <td class="py-2 text-text-primary">{{ row.title }}</td>
                    <td class="py-2 text-text-secondary" dir="ltr">{{ row.whenLabel }}</td>
                    <td class="py-2 text-text-secondary">{{ row.typeLabel }}</td>
                    <td class="py-2">
                      <pera-status-badge [tone]="row.statusTone" [label]="row.statusLabel" />
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        } @else {
          <pera-empty [title]="catalog.t('sched.meetings')" />
        }
      </div>
    </div>
  `,
})
export class CrmMeetingsSummaryComponent {
  protected readonly catalog = inject(CatalogService);
  readonly rows = input<CrmMeetingSummaryRow[]>([]);
}

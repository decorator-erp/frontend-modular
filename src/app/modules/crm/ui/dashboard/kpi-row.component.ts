import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { CatalogService } from '@platform/i18n/catalog.service';
import { PeraKpiTileComponent } from '@ds';

/**
 * The KPI chip row (T037, FR-020) — pending approvals, upcoming meetings, unconfirmed
 * items. Presentational: the dashboard supplies the counts.
 *
 * ⚠️ **`pendingApprovals` stays an honest zero past B2.** The approvals inbox
 * (`GET /api/approvals/pending`) isn't project-scoped on the wire — a scoped source
 * arrives only with B6b's inbox (T117+). `upcomingMeetings` is wired at B2 from
 * `MeetingsStore.agenda()`; `unconfirmed` is `CrmItemService.search()` filtered to the
 * open period's Draft + PendingApproval employee-authored items. See
 * `crm-dashboard.component.ts`.
 */
@Component({
  selector: 'app-crm-kpi-row',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PeraKpiTileComponent],
  host: { class: 'block' },
  template: `
    <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
      <pera-kpi-tile
        [caption]="catalog.t('kpi.pend')"
        [value]="pendingApprovals()"
        [message]="pendMessage()"
      />
      <pera-kpi-tile
        [caption]="catalog.t('kpi.meet')"
        [value]="upcomingMeetings()"
        [message]="meetMessage()"
      />
      <pera-kpi-tile
        [caption]="catalog.t('kpi.unconf')"
        [value]="unconfirmedDraft() + unconfirmedPending()"
        [message]="unconfMessage()"
      />
    </div>
  `,
})
export class CrmKpiRowComponent {
  protected readonly catalog = inject(CatalogService);

  readonly pendingApprovals = input(0);
  readonly upcomingMeetings = input(0);
  readonly unconfirmedDraft = input(0);
  readonly unconfirmedPending = input(0);

  protected readonly pendMessage = computed(() =>
    this.catalog.t('kpi.pendM', { n: this.pendingApprovals() }),
  );
  protected readonly meetMessage = computed(() =>
    this.catalog.t('kpi.meetM', { n: this.upcomingMeetings() }),
  );
  protected readonly unconfMessage = computed(() =>
    this.catalog.t('kpi.unconfM', {
      draft: this.unconfirmedDraft(),
      pending: this.unconfirmedPending(),
    }),
  );
}

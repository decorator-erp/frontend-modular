import { CanDirective } from '@platform/permissions';
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CatalogService } from '@platform/i18n/catalog.service';
import { ApprovalState } from '../../model/crm-enums';
import { PeraCardComponent, PeraEmptyComponent, PeraStatusBadgeComponent } from '@ds';
import { trustChip } from '../trust/trust-chip';
import { ClientHubStore } from '../../stores/client-hub.store';
import { BriefStore } from '../../stores/brief.store';
import { ItemsStore } from '../../stores/items.store';
import { PeriodStore } from '../../stores/period.store';

/**
 * Gathering tab (C) — a READ-ONLY summary of the selected project's gathering work.
 *
 * Project work is managed where its aggregate root lives: everything keyed by
 * `project_id` belongs under `/crm/projects/:projectId/*`. This tab used to embed the
 * period card, the brief head, the ledger and the items board — thirteen project-keyed
 * write paths on a client page. It now reports state and links out.
 *
 * The four project stores stay provided by the hub shell: they are already loaded for the
 * selected project, so the summary costs ZERO extra calls. (It does mean the brief and the
 * items list are fetched in full just to derive counts — today's cost, unchanged; a
 * per-project summary endpoint would collapse it.)
 */
@Component({
  selector: 'app-client-hub-gathering-tab',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CanDirective,
    RouterLink,
    PeraCardComponent,
    PeraEmptyComponent,
    PeraStatusBadgeComponent,
  ],
  template: `
    @if (!hub.selectedProjectId()) {
      <pera-empty
        [title]="catalog.t('hub.noProjectSelected')"
        [description]="catalog.t('hub.pickOrCreateProject')"
      />
    } @else {
      <div class="p-6 flex flex-col gap-4">
        <pera-card>
          <div class="flex flex-col gap-3 p-1">
            <div class="flex items-center gap-2">
              <span class="font-semibold fs-body-sm text-text-primary">{{
                catalog.t('hub.gatheringSummary')
              }}</span>
              <a
                class="ms-auto fs-caption text-accent hover:underline"
                [routerLink]="['/crm/projects', projectId()]"
                >{{ catalog.t('hub.manageInProject') }}</a
              >
            </div>

            <!-- Period -->
            <div class="flex items-center gap-2 flex-wrap">
              <span class="fs-caption text-text-secondary">{{ catalog.t('period.title') }}</span>
              @if (period.openPeriod()) {
                <pera-status-badge tone="success" [label]="catalog.t('trust.open')" />
              } @else {
                <pera-status-badge tone="neutral" [label]="catalog.t('trust.closed')" />
              }
            </div>

            @if (!period.openPeriod()) {
              <!-- Opening a period seeds the brief head, so this link IS the answer to
                   "how do I start the brief?" -->
              <p class="fs-caption text-text-muted m-0">
                {{ catalog.t('hub.openPeriodHint') }}
              </p>
            } @else {
              <!-- Brief -->
              <div class="flex items-center gap-2 flex-wrap">
                <span class="fs-caption text-text-secondary">{{ catalog.t('brief.title') }}</span>
                <pera-status-badge [tone]="briefChip().tone" [label]="catalog.t(briefChip().key)" />
                <span class="font-mono fs-caption text-text-muted">{{ entryCount() }}</span>
                <span class="fs-caption text-text-muted">{{ catalog.t('brief.secLedgerT') }}</span>
              </div>

              <!-- Items -->
              <div class="flex items-center gap-2 flex-wrap">
                <span class="fs-caption text-text-secondary">{{ catalog.t('nav.items') }}</span>
                <span class="font-mono fs-caption text-text-muted">{{ itemCount() }}</span>
              </div>
            }

            <!-- Real anchors, not buttons: these navigate, so they should carry an href
                 and be middle-clickable. -->
            <div class="flex items-center gap-3 flex-wrap pt-1">
              <a
                *peraCan="'crm.briefs.read'"
                class="fs-caption text-accent hover:underline"
                [routerLink]="['/crm/projects', projectId(), 'brief']"
                >{{ catalog.t('hub.manageBrief') }}</a
              >
              <a
                *peraCan="'crm.spaces.read'"
                class="fs-caption text-accent hover:underline"
                [routerLink]="['/crm/projects', projectId(), 'spaces']"
                >{{ catalog.t('space.title') }}</a
              >
              <a
                *peraCan="'crm.items.read'"
                class="fs-caption text-accent hover:underline"
                [routerLink]="['/crm/projects', projectId(), 'items']"
                >{{ catalog.t('nav.items') }}</a
              >
            </div>
          </div>
        </pera-card>
      </div>
    }
  `,
})
export class ClientHubGatheringTabComponent {
  protected readonly catalog = inject(CatalogService);
  protected readonly hub = inject(ClientHubStore);
  protected readonly period = inject(PeriodStore);
  private readonly brief = inject(BriefStore);
  private readonly items = inject(ItemsStore);

  protected readonly projectId = computed(() => this.hub.selectedProjectId() ?? '');
  protected readonly entryCount = computed(() => this.brief.spaces().length);
  protected readonly itemCount = computed(() => this.items.items().length);

  /** The head's own trust state — the same chip the brief page shows. */
  protected briefChip() {
    return trustChip(this.brief.head()?.status ?? ApprovalState.Draft, false);
  }
}

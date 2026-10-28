import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CatalogService } from '@platform/i18n/catalog.service';
import { formatCairoDateTime } from '@platform/i18n/intl-locale';
import { PeraCardComponent, PeraEmptyComponent } from '@ds';
import { ClientHubStore } from '../../stores/client-hub.store';
import { MeetingsStore } from '../../stores/meetings.store';

/**
 * Meetings tab (D1) — a READ-ONLY summary of the selected project's scheduling.
 *
 * Meetings are keyed by `project_id`, so proposing, accepting, declining, rescheduling,
 * cancelling and completing them all belong on `/crm/projects/:projectId/scheduler` — which
 * already hosts exactly the components this tab used to embed. Seven write paths moved out;
 * what remains answers "where does this client stand?" and links to the surface that acts.
 */
@Component({
  selector: 'app-client-hub-meetings-tab',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, PeraCardComponent, PeraEmptyComponent],
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
                catalog.t('hub.tMeetings')
              }}</span>
              <a
                class="ms-auto fs-caption text-accent hover:underline"
                [routerLink]="['/crm/projects', projectId(), 'scheduler']"
                >{{ catalog.t('hub.manageMeetings') }}</a
              >
            </div>

            @if (nextMeeting(); as next) {
              <div class="flex items-center gap-2 flex-wrap">
                <span class="fs-caption text-text-secondary">{{
                  catalog.t('hub.nextMeeting')
                }}</span>
                <span class="fs-body-sm text-text-primary" dir="auto">{{ next.title }}</span>
                @if (next.scheduledAtUtc) {
                  <span class="fs-caption text-text-muted" dir="ltr">{{
                    formatCairoDateTime(next.scheduledAtUtc, catalog.locale())
                  }}</span>
                }
              </div>
            } @else {
              <p class="fs-caption text-text-muted m-0">{{ catalog.t('hub.noMeetings') }}</p>
            }

            @if (incomingCount() > 0) {
              <div class="flex items-center gap-2">
                <span class="fs-caption text-text-secondary">{{
                  catalog.t('hub.incomingRequests')
                }}</span>
                <span class="font-mono fs-caption text-text-muted">{{ incomingCount() }}</span>
              </div>
            }
          </div>
        </pera-card>
      </div>
    }
  `,
})
export class ClientHubMeetingsTabComponent {
  protected readonly catalog = inject(CatalogService);
  protected readonly hub = inject(ClientHubStore);
  private readonly meetings = inject(MeetingsStore);
  protected readonly formatCairoDateTime = formatCairoDateTime;

  protected readonly projectId = computed(() => this.hub.selectedProjectId() ?? '');
  protected readonly nextMeeting = computed(() => this.meetings.agenda()[0] ?? null);
  protected readonly incomingCount = computed(() => this.meetings.incomingRequests().length);
}

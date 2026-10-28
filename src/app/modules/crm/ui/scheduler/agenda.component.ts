import { ChangeDetectionStrategy, Component, inject, input, output } from '@angular/core';
import { CanDirective, PERM } from '@platform/permissions';
import { CatalogService } from '@platform/i18n/catalog.service';
import { formatCairoDateTime } from '@platform/i18n/intl-locale';
import { MeetingStatus } from '../../model/crm-enums';
import type { CatalogKey } from '@platform/i18n/catalog/en';
import type { CrmMeeting } from '../../model';
import {
  PeraButtonComponent,
  PeraEmptyComponent,
  PeraStatusBadgeComponent,
  StatusBadgeTone,
} from '@ds';
import { MEETING_STATUS_CHIP, MEETING_TYPE_KEYS } from './meeting-labels';

/** The employee agenda for the period (T049) — every meeting, soonest first. */
@Component({
  selector: 'app-crm-agenda',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CanDirective, PeraButtonComponent, PeraStatusBadgeComponent, PeraEmptyComponent],
  host: { class: 'block' },
  template: `
    <div class="bg-surface border border-border rounded-card">
      <div class="px-4 py-3 border-b border-border font-semibold text-text-primary">
        {{ catalog.t('sched.agenda') }}
      </div>
      <div class="p-4">
        @if (rows().length) {
          <ul class="flex flex-col gap-3">
            @for (m of rows(); track m.id) {
              <li
                class="flex items-center justify-between gap-3 flex-wrap border-b border-border pb-3 last:border-0 last:pb-0"
              >
                <div class="min-w-0">
                  <div class="text-text-primary font-medium">{{ m.title }}</div>
                  <div class="fs-caption text-text-secondary" dir="ltr">
                    @if (m.scheduledAtUtc) {
                      {{ formatCairoDateTime(m.scheduledAtUtc, catalog.locale()) }}
                    }
                  </div>
                  <div class="fs-label text-text-muted">{{ catalog.t(typeKey(m)) }}</div>
                </div>
                <div class="flex items-center gap-2">
                  <pera-status-badge [tone]="chip(m).tone" [label]="catalog.t(chip(m).key)" />
                  @if (canAct(m)) {
                    <div class="flex items-center gap-1.5" *peraCan="PERM.crm.meetings.complete">
                      <pera-button size="xs" variant="secondary" (click)="complete.emit(m.id)">{{
                        catalog.t('ws.completeTask')
                      }}</pera-button>
                      <pera-button size="xs" variant="ghost" (click)="noShow.emit(m.id)">{{
                        catalog.t('sched.decline')
                      }}</pera-button>
                    </div>
                  }
                  <div class="flex items-center gap-1.5">
                    <pera-button
                      size="xs"
                      variant="ghost"
                      *peraCan="PERM.crm.meetings.reschedule"
                      (click)="reschedule.emit(m.id)"
                      >{{ catalog.t('sched.reschedule') }}</pera-button
                    >
                    <pera-button
                      size="xs"
                      variant="ghost"
                      *peraCan="PERM.crm.meetings.cancel"
                      (click)="cancelMeeting.emit(m.id)"
                      >{{ catalog.t('sched.cancel') }}</pera-button
                    >
                  </div>
                </div>
              </li>
            }
          </ul>
        } @else {
          <pera-empty [title]="catalog.t('sched.agenda')" />
        }
      </div>
    </div>
  `,
})
export class CrmAgendaComponent {
  protected readonly catalog = inject(CatalogService);
  protected readonly PERM = PERM;
  protected readonly formatCairoDateTime = formatCairoDateTime;

  readonly rows = input<CrmMeeting[]>([]);
  readonly complete = output<string>();
  readonly noShow = output<string>();
  readonly reschedule = output<string>();
  readonly cancelMeeting = output<string>();

  protected typeKey(m: CrmMeeting): CatalogKey {
    return MEETING_TYPE_KEYS[m.type];
  }

  protected chip(m: CrmMeeting): { tone: StatusBadgeTone; key: CatalogKey } {
    return MEETING_STATUS_CHIP[m.status];
  }

  /**
   * Complete / No-show are offered only once the meeting has started: before `scheduledAtUtc` the
   * server refuses both with 409 `crm.meetings.InvalidStateTransition` (009b #21, contract §8.3.10).
   */
  protected canAct(m: CrmMeeting, nowMs: number = Date.now()): boolean {
    if (m.status !== MeetingStatus.Scheduled && m.status !== MeetingStatus.Rescheduled)
      return false;
    return !!m.scheduledAtUtc && new Date(m.scheduledAtUtc).getTime() <= nowMs;
  }
}

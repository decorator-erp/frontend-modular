import { ChangeDetectionStrategy, Component, inject, input, output } from '@angular/core';
import { CanDirective, PERM } from '@platform/permissions';
import { CatalogService } from '@platform/i18n/catalog.service';
import { formatCairoDateTime } from '@platform/i18n/intl-locale';
import { MeetingSlotStatus } from '../../model/crm-enums';
import type { CrmMeeting } from '../../model';
import { PeraButtonComponent, PeraEmptyComponent, PeraStatusBadgeComponent } from '@ds';
import { isSlotHeld, isSlotHoldExpired } from '../../stores/meetings.store';

/**
 * The employee incoming-requests table (T048, FR-022) — client-initiated meeting
 * requests awaiting accept/decline. Hold expiry renders as an ABSOLUTE timestamp chip
 * (amber), never a relative countdown — the prototype's copy is explicit about this
 * (`sched.holdExpires`). A hold that has lapsed while still visible (T054) is called
 * out rather than silently offered as if still live.
 */
@Component({
  selector: 'app-crm-incoming-requests',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CanDirective, PeraButtonComponent, PeraStatusBadgeComponent, PeraEmptyComponent],
  host: { class: 'block' },
  template: `
    <div class="bg-surface border border-border rounded-card">
      <div class="px-4 py-3 border-b border-border font-semibold text-text-primary">
        {{ catalog.t('sched.incoming') }}
      </div>
      <div class="p-4">
        @if (requests().length) {
          <ul class="flex flex-col gap-3">
            @for (m of requests(); track m.id) {
              @let heldSlot = requestedSlot(m);
              <li class="flex flex-col gap-2 border border-border rounded-sm p-3">
                <div class="flex items-center justify-between gap-3 flex-wrap">
                  <div class="min-w-0">
                    <div class="text-text-primary font-medium">{{ m.title }}</div>
                    <div class="fs-caption text-text-secondary" dir="ltr">
                      @if (heldSlot) {
                        {{ whenLabel(heldSlot.startsAtUtc) }}
                      }
                    </div>
                  </div>
                  @if (heldSlot) {
                    @if (isExpired(heldSlot)) {
                      <pera-status-badge tone="error" [label]="catalog.t('sched.held1')" />
                    } @else {
                      <pera-status-badge tone="warning" [label]="catalog.t('sched.held1')" />
                    }
                  }
                </div>
                @if (heldSlot && !isExpired(heldSlot)) {
                  <div class="fs-label text-text-muted" dir="ltr">
                    {{ catalog.t('sched.holdExpires') }}:
                    {{ whenLabel(heldSlot.holdExpiresAtUtc!) }}
                  </div>
                }
                <div class="flex items-center gap-2" *peraCan="PERM.crm.meetings.respondSlot">
                  <pera-button
                    size="sm"
                    variant="primary"
                    [disabled]="!heldSlot"
                    (click)="heldSlot && accept.emit(heldSlot.id)"
                    >{{ catalog.t('sched.accept') }}</pera-button
                  >
                  <pera-button
                    size="sm"
                    variant="secondary"
                    [disabled]="!heldSlot"
                    (click)="heldSlot && decline.emit(heldSlot.id)"
                    >{{ catalog.t('sched.decline') }}</pera-button
                  >
                </div>
              </li>
            }
          </ul>
        } @else {
          <pera-empty [title]="catalog.t('sched.incoming')" />
        }
      </div>
    </div>
  `,
})
export class CrmIncomingRequestsComponent {
  protected readonly catalog = inject(CatalogService);
  protected readonly PERM = PERM;

  readonly requests = input<CrmMeeting[]>([]);
  readonly accept = output<string>();
  readonly decline = output<string>();

  protected requestedSlot(m: CrmMeeting) {
    return m.slots.find((s) => s.status === MeetingSlotStatus.Proposed && s.proposedByContactId);
  }

  protected isExpired(slot: ReturnType<CrmIncomingRequestsComponent['requestedSlot']>): boolean {
    return !!slot && isSlotHoldExpired(slot) && !isSlotHeld(slot);
  }

  protected whenLabel(iso: string): string {
    return formatCairoDateTime(iso, this.catalog.locale());
  }
}

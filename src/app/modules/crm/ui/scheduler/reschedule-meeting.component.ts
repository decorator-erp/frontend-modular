import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { CrmMeetingService } from '../../data/crm-meeting.service';
import { ErrorHandlerService, friendly } from '@platform/http/error-handler.service';
import { CatalogService } from '@platform/i18n/catalog.service';
import type { FreeSlot } from '../../model';
import { ToastService } from '@platform/feedback/toast.service';
import { ParsedApiError } from '@platform/types';
import { PERA_MODAL_DATA, PeraAlertComponent, PeraFormModalComponent, PeraModalRef } from '@ds';
import { CrmSlotGridComponent } from './slot-grid.component';

export interface RescheduleMeetingDialogData {
  meetingId: string;
  projectId: string;
  /** `true` when opened from the client portal — targets the portal endpoint instead. */
  asClient?: boolean;
}

/**
 * Reschedule (T053, FR-023 amended) — **a NEW slot proposal, an offer, never a
 * withdrawal**. Unlike cancel, it takes NO reason: picking a single new free slot IS
 * the whole action.
 */
@Component({
  selector: 'app-crm-reschedule-meeting',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PeraFormModalComponent, PeraAlertComponent, CrmSlotGridComponent],
  template: `
    <pera-form-modal
      [eyebrow]="
        data.asClient
          ? 'PUT /api/crm/portal/meetings/{id}/reschedule'
          : 'PUT /api/crm/meetings/{id}/reschedule'
      "
      [title]="catalog.t('sched.reschedule')"
      permission="crm.meetings.reschedule"
      [submitLabel]="catalog.t('sched.reschedule')"
      [submitting]="submitting()"
      [submitDisabled]="!picked()"
      [errorMessage]="serverError()?.generalMessage ?? null"
      [errorCode]="serverError()?.code ?? null"
      (submitted)="submit()"
      (cancelled)="close()"
    >
      <div class="flex flex-col gap-4">
        <app-crm-slot-grid
          [freeSlots]="freeSlots()"
          [interactive]="true"
          (slotTap)="picked.set($event)"
        />
        @if (picked()) {
          <pera-alert tone="info"
            >{{ catalog.t('sched.slot') }}: {{ picked()!.startsAtUtc }}</pera-alert
          >
        }
      </div>
    </pera-form-modal>
  `,
})
export class CrmRescheduleMeetingComponent {
  private readonly meetings = inject(CrmMeetingService);
  private readonly errorHandler = inject(ErrorHandlerService);
  private readonly toast = inject(ToastService);
  private readonly modalRef = inject(PeraModalRef) as PeraModalRef<boolean>;
  protected readonly catalog = inject(CatalogService);
  readonly data = inject(PERA_MODAL_DATA) as RescheduleMeetingDialogData;

  protected readonly freeSlots = signal<FreeSlot[]>([]);
  protected readonly picked = signal<FreeSlot | null>(null);

  readonly serverError = signal<ParsedApiError | null>(null);
  readonly submitting = signal(false);

  constructor() {
    const fromUtc = new Date().toISOString();
    const toUtc = new Date(Date.now() + 30 * 86_400_000).toISOString();
    this.meetings
      .freeSlots(this.data.projectId, fromUtc, toUtc)
      .subscribe((slots) => this.freeSlots.set(slots));
  }

  close(): void {
    this.modalRef.close(false);
  }

  submit(): void {
    const slot = this.picked();
    if (!slot) return;
    this.submitting.set(true);
    this.serverError.set(null);

    const call = this.data.asClient
      ? this.meetings.portalReschedule(this.data.meetingId, slot)
      : this.meetings.reschedule(this.data.meetingId, slot);

    call.subscribe({
      next: () => {
        this.toast.show({ tone: 'success', message: this.catalog.t('sched.reschedule') });
        this.modalRef.close(true);
      },
      error: (err) => {
        const parsed = this.errorHandler.parse(err);
        this.serverError.set({ ...parsed, generalMessage: friendly(parsed) });
        this.submitting.set(false);
      },
    });
  }
}

import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { CrmMeetingService } from '../../data/crm-meeting.service';
import { ErrorHandlerService, friendly } from '@platform/http/error-handler.service';
import { CatalogService } from '@platform/i18n/catalog.service';
import type { CatalogKey } from '@platform/i18n/catalog/en';
import { MeetingType } from '../../model/crm-enums';
import type { FreeSlot } from '../../model';
import { ToastService } from '@platform/feedback/toast.service';
import { ParsedApiError } from '@platform/types';
import { ServerErrorsDirective, firstErrorMessage } from '@shared/forms';
import {
  PERA_MODAL_DATA,
  PeraAlertComponent,
  PeraFormFieldComponent,
  PeraFormModalComponent,
  PeraInputComponent,
  PeraModalRef,
  PeraSelectComponent,
  SelectOption,
} from '@ds';
import { CrmSlotGridComponent } from './slot-grid.component';

export interface ProposeSlotsDialogData {
  projectId: string;
  periodId?: string | null;
}

const TYPE_KEYS: Record<MeetingType, CatalogKey> = {
  [MeetingType.InOffice]: 'sched.inOffice',
  [MeetingType.OnSite]: 'sched.onSite',
  [MeetingType.Online]: 'sched.online',
};

/**
 * The employee propose-slots composer (T050, "Organize meeting…") — pick one or more
 * free slots to send to the client. Reused as-is by B5's stage/task composer (FR-026),
 * which is why it talks to `CrmMeetingService` directly rather than a page-scoped store:
 * a modal's injector parents off the root, not the opening page's component providers,
 * so it cannot see a feature-scoped `MeetingsStore` instance — the host reloads its own
 * store from `afterClosed()`, matching the `CrmPeriodFormComponent` precedent.
 */
@Component({
  selector: 'app-crm-propose-slots',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    ServerErrorsDirective,
    PeraFormModalComponent,
    PeraFormFieldComponent,
    PeraInputComponent,
    PeraSelectComponent,
    PeraAlertComponent,
    CrmSlotGridComponent,
  ],
  template: `
    <pera-form-modal
      eyebrow="POST /api/crm/meetings/propose"
      [title]="catalog.t('sched.emTitle')"
      [subtitle]="catalog.t('sched.emHint')"
      permission="crm.meetings.schedule"
      [submitLabel]="catalog.t('sched.emSend')"
      [submittingLabel]="catalog.t('common.saving')"
      [submitting]="submitting()"
      [submitDisabled]="selectedSlots().length === 0"
      [errorMessage]="serverError()?.generalMessage ?? null"
      [errorCode]="serverError()?.code ?? null"
      (submitted)="submit()"
      (cancelled)="close()"
    >
      <div [formGroup]="form" [serverErrors]="serverError()" class="flex flex-col gap-4">
        <pera-form-field
          [label]="catalog.t('sched.emMeetTitle')"
          [required]="true"
          [error]="errorOf('title')"
        >
          <pera-input formControlName="title" [error]="errorOf('title')" />
        </pera-form-field>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-4">
          <pera-form-field [label]="catalog.t('common.type')">
            <pera-select formControlName="type" [options]="typeOptions" />
          </pera-form-field>
          <pera-form-field
            [label]="catalog.t('sched.duration')"
            [hint]="catalog.t('common.optionalLbl')"
          >
            <pera-input type="number" formControlName="durationMinutes" />
          </pera-form-field>
        </div>

        <pera-form-field
          [label]="catalog.t('sched.location')"
          [hint]="catalog.t('common.optionalLbl')"
        >
          <pera-input formControlName="location" />
        </pera-form-field>

        <div>
          <p class="fs-caption text-text-secondary mb-2">{{ catalog.t('sched.emPick') }}</p>
          <app-crm-slot-grid
            [freeSlots]="freeSlots()"
            [interactive]="true"
            [multiple]="true"
            (selectionChange)="selectedSlots.set($event)"
          />
        </div>

        @if (selectedSlots().length) {
          <pera-alert tone="info"
            >{{ selectedSlots().length }} {{ catalog.t('sched.slot') }}</pera-alert
          >
        }
      </div>
    </pera-form-modal>
  `,
})
export class CrmProposeSlotsComponent {
  private readonly fb = inject(FormBuilder);
  private readonly meetings = inject(CrmMeetingService);
  private readonly errorHandler = inject(ErrorHandlerService);
  private readonly toast = inject(ToastService);
  private readonly modalRef = inject(PeraModalRef) as PeraModalRef<boolean>;
  protected readonly catalog = inject(CatalogService);
  readonly data = inject(PERA_MODAL_DATA) as ProposeSlotsDialogData;

  protected readonly typeOptions: SelectOption[] = (
    [MeetingType.InOffice, MeetingType.OnSite, MeetingType.Online] as const
  ).map((value) => ({ value: String(value), label: this.catalog.t(TYPE_KEYS[value]) }));

  readonly form = this.fb.nonNullable.group({
    title: ['', [Validators.required, Validators.maxLength(200)]],
    type: [String(MeetingType.InOffice)],
    durationMinutes: [60],
    location: [''],
  });

  protected readonly freeSlots = signal<FreeSlot[]>([]);
  protected readonly selectedSlots = signal<FreeSlot[]>([]);

  readonly serverError = signal<ParsedApiError | null>(null);
  readonly submitting = signal(false);

  constructor() {
    const fromUtc = new Date().toISOString();
    const toUtc = new Date(Date.now() + 30 * 86_400_000).toISOString();
    this.meetings
      .freeSlots(this.data.projectId, fromUtc, toUtc)
      .subscribe((slots) => this.freeSlots.set(slots));
  }

  errorOf(name: string): string {
    const control = this.form.get(name);
    return control && control.touched && control.errors ? firstErrorMessage(control.errors) : '';
  }

  close(): void {
    this.modalRef.close(false);
  }

  submit(): void {
    if (this.form.invalid || this.selectedSlots().length === 0) {
      this.form.markAllAsTouched();
      return;
    }
    this.submitting.set(true);
    this.serverError.set(null);
    const v = this.form.getRawValue();

    this.meetings
      .propose({
        projectId: this.data.projectId,
        periodId: this.data.periodId ?? null,
        title: v.title.trim(),
        type: Number(v.type) as MeetingType,
        location: v.location.trim() || null,
        durationMinutes: v.durationMinutes || null,
        slots: this.selectedSlots(),
      })
      .subscribe({
        next: () => {
          this.toast.show({ tone: 'success', message: this.catalog.t('toast.slotsProposed') });
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

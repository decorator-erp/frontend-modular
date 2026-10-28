import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { CrmItemService } from '../../../data/crm-item.service';
import { CrmMeetingService } from '../../../data/crm-meeting.service';
import { ErrorHandlerService, friendly } from '@platform/http/error-handler.service';
import { CatalogService } from '@platform/i18n/catalog.service';
import type { CatalogKey } from '@platform/i18n/catalog/en';
import {
  RequirementCategory,
  RequirementPriority,
  RequirementSource,
} from '../../../model/crm-enums';
import type { CrmMeeting } from '../../../model';
import { ToastService } from '@platform/feedback/toast.service';
import { ParsedApiError } from '@platform/types';
import { ServerErrorsDirective, firstErrorMessage } from '@shared/forms';
import {
  PERA_MODAL_DATA,
  PeraFormFieldComponent,
  PeraFormModalComponent,
  PeraInputComponent,
  PeraModalRef,
  PeraSelectComponent,
  SelectOption,
} from '@ds';

export interface ItemFormDialogData {
  projectId: string;
  periodId: string;
}

const CATEGORY_KEYS: Record<RequirementCategory, CatalogKey> = {
  [RequirementCategory.SpaceLayout]: 'item.catLayout',
  [RequirementCategory.Style]: 'item.catSelStyle',
  [RequirementCategory.ColorPalette]: 'item.catSelColorPalette',
  [RequirementCategory.Materials]: 'item.catSelMaterials',
  [RequirementCategory.Furniture]: 'item.catFurn1',
  [RequirementCategory.Lighting]: 'item.catLighting',
  [RequirementCategory.Budget]: 'item.catSelBudget',
  [RequirementCategory.Timeline]: 'item.catSelTimeline',
  [RequirementCategory.Technical]: 'item.catSelTechnical',
  [RequirementCategory.Other]: 'common.other',
};

const PRIORITY_KEYS: Record<RequirementPriority, CatalogKey> = {
  [RequirementPriority.Low]: 'item.prLow',
  [RequirementPriority.Medium]: 'item.prMed',
  [RequirementPriority.High]: 'item.prHigh',
  [RequirementPriority.Urgent]: 'item.prUrgent',
};

/**
 * Add a requirement item (T043, FR-021). **Source is optional and never blocks the
 * save.** B1-backfill (wired at B2, now that `CrmMeetingService` exists): an OPTIONAL
 * source-meeting picker. Leaving it unset still saves `sourceType: null` — a fully
 * legal, always-valid state (`SourceMatches` accepts `null` unconditionally). The
 * source-brief and source-note pickers remain future backfill for B3 and notes, which
 * do not exist yet.
 */
@Component({
  selector: 'app-crm-item-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    ServerErrorsDirective,
    PeraFormModalComponent,
    PeraFormFieldComponent,
    PeraInputComponent,
    PeraSelectComponent,
  ],
  template: `
    <pera-form-modal
      eyebrow="POST /api/crm/periods/{periodId}/items"
      [title]="catalog.t('nav.itemForm')"
      [subtitle]="catalog.t('item.formSub')"
      permission="crm.items.create"
      [submitLabel]="catalog.t('common.saveDraft')"
      [submittingLabel]="catalog.t('common.saving')"
      [submitting]="submitting()"
      [errorMessage]="serverError()?.generalMessage ?? null"
      [errorCode]="serverError()?.code ?? null"
      (submitted)="submit()"
      (cancelled)="close()"
    >
      <div [formGroup]="form" [serverErrors]="serverError()" class="flex flex-col gap-4">
        <pera-form-field
          [label]="catalog.t('item.item')"
          [required]="true"
          [error]="errorOf('title')"
        >
          <pera-input formControlName="title" [error]="errorOf('title')" />
        </pera-form-field>

        <div class="grid grid-cols-2 gap-x-4 gap-y-4">
          <pera-form-field
            [label]="catalog.t('brief.fCategory')"
            [required]="true"
            [error]="errorOf('category')"
          >
            <pera-select
              formControlName="category"
              [options]="categoryOptions"
              [error]="errorOf('category')"
            />
          </pera-form-field>
          <pera-form-field
            [label]="catalog.t('brief.room')"
            [hint]="catalog.t('common.optionalLbl')"
          >
            <pera-input formControlName="room" />
          </pera-form-field>
        </div>

        <pera-form-field [label]="catalog.t('item.priority')">
          <pera-select formControlName="priority" [options]="priorityOptions" />
        </pera-form-field>

        <pera-form-field
          class="col-span-2"
          [label]="catalog.t('brief.entryReqsL')"
          [hint]="catalog.t('common.optionalLbl')"
        >
          <pera-input formControlName="details" />
        </pera-form-field>

        <pera-form-field
          [label]="catalog.t('item.srcMeeting')"
          [hint]="catalog.t('common.optionalLbl')"
        >
          <pera-select formControlName="meetingId" [options]="meetingOptions()" placeholder="—" />
        </pera-form-field>

        <p class="fs-caption text-text-muted m-0">{{ catalog.t('item.formHint') }}</p>
      </div>
    </pera-form-modal>
  `,
})
export class CrmItemFormComponent {
  private readonly fb = inject(FormBuilder);
  private readonly items = inject(CrmItemService);
  private readonly meetingService = inject(CrmMeetingService);
  private readonly errorHandler = inject(ErrorHandlerService);
  private readonly toast = inject(ToastService);
  private readonly modalRef = inject(PeraModalRef) as PeraModalRef<boolean>;
  protected readonly catalog = inject(CatalogService);
  readonly data = inject(PERA_MODAL_DATA) as ItemFormDialogData;

  protected readonly meetingOptions = signal<SelectOption[]>([{ value: '', label: '—' }]);

  protected readonly categoryOptions: SelectOption[] = Object.keys(CATEGORY_KEYS)
    .map(Number)
    .map((value) => ({
      value: String(value),
      label: this.catalog.t(CATEGORY_KEYS[value as RequirementCategory]),
    }));

  protected readonly priorityOptions: SelectOption[] = Object.keys(PRIORITY_KEYS)
    .map(Number)
    .map((value) => ({
      value: String(value),
      label: this.catalog.t(PRIORITY_KEYS[value as RequirementPriority]),
    }));

  readonly form = this.fb.nonNullable.group({
    title: ['', [Validators.required, Validators.maxLength(200)]],
    category: [String(RequirementCategory.SpaceLayout), [Validators.required]],
    room: [''],
    priority: [String(RequirementPriority.Medium)],
    details: ['', [Validators.maxLength(2000)]],
    meetingId: [''],
  });

  readonly serverError = signal<ParsedApiError | null>(null);
  readonly submitting = signal(false);

  constructor() {
    this.meetingService.search(this.data.projectId).subscribe((page) => {
      this.meetingOptions.set([
        { value: '', label: '—' },
        ...page.items.map((m: CrmMeeting) => ({ value: m.id, label: m.title })),
      ]);
    });
  }

  errorOf(name: string): string {
    const control = this.form.get(name);
    return control && control.touched && control.errors ? firstErrorMessage(control.errors) : '';
  }

  close(): void {
    this.modalRef.close(false);
  }

  submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.submitting.set(true);
    this.serverError.set(null);
    const v = this.form.getRawValue();
    const meetingId = v.meetingId || null;

    this.items
      .create(this.data.periodId, {
        projectId: this.data.projectId,
        category: Number(v.category),
        title: v.title.trim(),
        priority: Number(v.priority),
        room: v.room.trim() || null,
        description: v.details.trim() || null,
        sourceType: meetingId ? RequirementSource.Meeting : null,
        meetingId,
      })
      .subscribe({
        next: () => {
          this.toast.show({ tone: 'success', message: this.catalog.t('item.saved') });
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

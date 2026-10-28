import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import type { Observable } from 'rxjs';
import { CrmItemService } from '../../data/crm-item.service';
import { CrmMeetingService } from '../../data/crm-meeting.service';
import { injectReloadOnConflict } from '@platform/http/concurrency';
import { ErrorHandlerService, friendly } from '@platform/http/error-handler.service';
import { CatalogService } from '@platform/i18n/catalog.service';
import type { CatalogKey } from '@platform/i18n/catalog/en';
import { RequirementCategory, RequirementPriority, RequirementSource } from '../../model/crm-enums';
import type { CrmMeeting, RequirementItem, UpdateRequirementItemRequest } from '../../model';
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

export type ItemFormMode = 'add' | 'edit' | 'supersede';

export interface CrmItemFormDialogData {
  projectId: string;
  periodId: string;
  mode: ItemFormMode;
  /** Required for `edit` / `supersede`. */
  existing?: RequirementItem;
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
 * The items board's add/edit/"New version…" form (T083/T086) — a fuller-featured
 * sibling of the B1 dashboard's quick add form (`dashboard/forms/item-form.component.ts`,
 * T043, left unchanged per SC-009). `supersede` is reached ONLY from a locked
 * (Approved/Trusted) row — the ledger's ONLY offered path there (FR-010).
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
      [eyebrow]="eyebrow()"
      [title]="catalog.t(mode === 'supersede' ? 'trust.newVersion' : 'item.item')"
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
          <pera-form-field [label]="catalog.t('brief.fCategory')" [required]="true">
            <pera-select formControlName="category" [options]="categoryOptions" />
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
          [label]="catalog.t('brief.entryReqsL')"
          [hint]="catalog.t('common.optionalLbl')"
        >
          <pera-input formControlName="details" />
        </pera-form-field>

        @if (mode !== 'supersede') {
          <pera-form-field
            [label]="catalog.t('item.srcMeeting')"
            [hint]="catalog.t('common.optionalLbl')"
          >
            <pera-select formControlName="meetingId" [options]="meetingOptions()" placeholder="—" />
          </pera-form-field>
        }
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
  private readonly reloadOnConflict = injectReloadOnConflict();
  private readonly modalRef = inject(PeraModalRef) as PeraModalRef<boolean>;
  protected readonly catalog = inject(CatalogService);
  readonly data = inject(PERA_MODAL_DATA) as CrmItemFormDialogData;

  readonly mode = this.data.mode;

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

  protected readonly meetingOptions = signal<SelectOption[]>([{ value: '', label: '—' }]);

  readonly form = this.fb.nonNullable.group({
    title: [this.data.existing?.title ?? '', [Validators.required, Validators.maxLength(200)]],
    category: [
      String(this.data.existing?.category ?? RequirementCategory.SpaceLayout),
      [Validators.required],
    ],
    room: [this.data.existing?.room ?? ''],
    priority: [String(this.data.existing?.priority ?? RequirementPriority.Medium)],
    details: [this.data.existing?.details ?? ''],
    meetingId: [this.data.existing?.meetingId ?? ''],
  });

  readonly serverError = signal<ParsedApiError | null>(null);
  readonly submitting = signal(false);

  protected eyebrow(): string {
    if (this.mode === 'add') return 'POST /api/crm/periods/{periodId}/items';
    if (this.mode === 'supersede') return 'POST /api/crm/requirement-items/{itemId}/supersede';
    return 'PUT /api/crm/requirement-items/{itemId}';
  }

  constructor() {
    this.meetingService.search(this.data.projectId).subscribe((meetings: CrmMeeting[]) => {
      this.meetingOptions.set([
        { value: '', label: '—' },
        ...meetings.map((m) => ({ value: m.id, label: m.title })),
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

    const updateRequest: UpdateRequirementItemRequest = {
      category: Number(v.category),
      title: v.title.trim(),
      priority: Number(v.priority),
      // 009b #24: update/supersede bind spaceTypeId positionally — keep the item's own value.
      spaceTypeId: this.data.existing?.spaceTypeId ?? null,
      room: v.room.trim() || null,
      description: v.details.trim() || null,
      sourceType: v.meetingId ? RequirementSource.Meeting : null,
      meetingId: v.meetingId || null,
    };

    let call: Observable<unknown>;
    if (this.mode === 'add') {
      call = this.items.create(this.data.periodId, {
        projectId: this.data.projectId,
        ...updateRequest,
      });
    } else if (this.mode === 'supersede') {
      call = this.items.supersede(this.data.existing!.id, updateRequest);
    } else {
      call = this.items.update(this.data.existing!.id, updateRequest);
    }

    call.subscribe({
      next: () => {
        this.toast.show({ tone: 'success', message: this.catalog.t('item.saved') });
        this.modalRef.close(true);
      },
      error: (err) => {
        // 009b #24: 409 crm.items.ConcurrentUpdate → close as done; the board reloads (X-3).
        if (this.reloadOnConflict(err, () => this.modalRef.close(true))) return;
        const parsed = this.errorHandler.parse(err);
        this.serverError.set({ ...parsed, generalMessage: friendly(parsed) });
        this.submitting.set(false);
      },
    });
  }
}

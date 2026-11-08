import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ProjectStageService } from '../../data/project-stage.service';
import { ErrorHandlerService, friendly } from '@platform/http/error-handler.service';
import { ToastService } from '@platform/feedback/toast.service';
import { CreateProjectStageRequest, UpdateProjectStageRequest } from '../../model/project.model';
import { ParsedApiError } from '@platform/types';
import { PeraValidators, ServerErrorsDirective, firstErrorMessage } from '@shared/forms';
import {
  PERA_MODAL_DATA,
  PeraDateInputComponent,
  PeraFormFieldComponent,
  PeraFormModalComponent,
  PeraInputComponent,
  PeraModalRef,
  PeraSelectComponent,
  PeraTextareaComponent,
  SelectOption,
} from '@ds';
import { StageTemplatesService } from '@modules/library';
import { CatalogService } from '@platform/i18n/catalog.service';
import { catchError, of } from 'rxjs';

export interface StageFormDialogData {
  mode: 'create' | 'edit';
  projectId: string;
  stageId?: string;
  /** Suggested order for a new stage (max existing order + 10). */
  nextOrder?: number;
  initial?: {
    name: string;
    order: number;
    estimatedStartDate: string | null;
    estimatedEndDate: string | null;
    description: string | null;
    notes: string | null;
  };
}

/**
 * Create / edit a project stage (DMS Forms · Stage). New stages start Locked.
 * The design's "From template stage" select is omitted — seeding a stage from a
 * StageTemplate is the project wizard's job and there is no per-stage template
 * lookup endpoint (see docs/STAGE_TASK_BACKEND_GAPS.md).
 */
@Component({
  selector: 'app-stage-form-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    ServerErrorsDirective,
    PeraFormModalComponent,
    PeraFormFieldComponent,
    PeraInputComponent,
    PeraTextareaComponent,
    PeraDateInputComponent,
    PeraSelectComponent,
  ],
  template: `
    <pera-form-modal
      [eyebrow]="
        isEdit ? 'PUT /api/projects/{id}/stages/{stageId}' : 'POST /api/projects/{id}/stages'
      "
      [title]="isEdit ? 'Edit stage' : 'New stage'"
      [subtitle]="
        isEdit
          ? 'Update stage name, order, planned dates and notes.'
          : 'Add a stage to a Stage-workflow project. New stages start Locked.'
      "
      permission="stages.manage"
      [submitLabel]="isEdit ? 'Save changes' : 'Create stage'"
      submittingLabel="Saving…"
      [submitting]="submitting()"
      [errorMessage]="serverError()?.generalMessage ?? null"
      [errorCode]="serverError()?.code ?? null"
      (submitted)="submit()"
      (cancelled)="close()"
    >
      <div
        [formGroup]="form"
        [serverErrors]="serverError()"
        class="grid grid-cols-2 gap-x-4 gap-y-4"
      >
        @if (!isEdit) {
          <!-- crmp P-2 (D2): optionally copy a template stage (StageRequest.templateStageId). -->
          <pera-form-field [label]="catalog.t('ps.fromTemplate')" [hint]="catalog.t('ps.optional')">
            <pera-select
              formControlName="templateId"
              [options]="templateOptions()"
              [placeholder]="catalog.t('ps.noTemplate')"
            />
          </pera-form-field>
          <pera-form-field [label]="catalog.t('ps.templateStage')">
            <pera-select
              formControlName="templateStageId"
              [options]="templateStageOptions()"
              [placeholder]="catalog.t('ps.pickTemplateStage')"
            />
          </pera-form-field>
        }
        <pera-form-field label="Stage name" [required]="true" [error]="errorOf('name')">
          <pera-input
            formControlName="name"
            placeholder="Technical design"
            [error]="errorOf('name')"
          />
        </pera-form-field>
        <pera-form-field
          label="Order"
          [required]="true"
          hint="Position in the sequence"
          [error]="errorOf('order')"
        >
          <pera-input type="number" formControlName="order" [error]="errorOf('order')" />
        </pera-form-field>
        <pera-form-field
          label="Estimated start"
          hint="optional"
          [error]="errorOf('estimatedStartDate')"
        >
          <pera-date-input
            formControlName="estimatedStartDate"
            [error]="errorOf('estimatedStartDate')"
          />
        </pera-form-field>
        <pera-form-field label="Estimated end" hint="optional" [error]="endDateError()">
          <pera-date-input
            formControlName="estimatedEndDate"
            [min]="form.controls.estimatedStartDate.value || null"
            [error]="endDateError()"
          />
        </pera-form-field>
        <pera-form-field class="col-span-2" label="Description" [error]="errorOf('description')">
          <pera-textarea
            formControlName="description"
            [rows]="3"
            [error]="errorOf('description')"
          />
        </pera-form-field>
        <pera-form-field class="col-span-2" label="Notes" [error]="errorOf('notes')">
          <pera-textarea formControlName="notes" [rows]="2" [error]="errorOf('notes')" />
        </pera-form-field>
      </div>
    </pera-form-modal>
  `,
})
export class StageFormDialogComponent {
  private readonly fb = inject(FormBuilder);
  private readonly stages = inject(ProjectStageService);
  private readonly errorHandler = inject(ErrorHandlerService);
  private readonly toast = inject(ToastService);
  private readonly modalRef = inject(PeraModalRef) as PeraModalRef<boolean>;
  readonly data = inject(PERA_MODAL_DATA) as StageFormDialogData;

  readonly isEdit = this.data.mode === 'edit';

  readonly form = this.fb.nonNullable.group(
    {
      name: [
        this.data.initial?.name ?? '',
        [Validators.required, PeraValidators.trimmedLength(1, 200)],
      ],
      order: [
        String(this.data.initial?.order ?? this.data.nextOrder ?? 10),
        [Validators.required, PeraValidators.positiveNumber],
      ],
      estimatedStartDate: [this.data.initial?.estimatedStartDate ?? ''],
      estimatedEndDate: [this.data.initial?.estimatedEndDate ?? ''],
      description: [this.data.initial?.description ?? '', [Validators.maxLength(1000)]],
      notes: [this.data.initial?.notes ?? '', [Validators.maxLength(1000)]],
      templateId: [null as string | null],
      templateStageId: [null as string | null],
    },
    { validators: [PeraValidators.dateRange('estimatedStartDate', 'estimatedEndDate')] },
  );

  protected readonly catalog = inject(CatalogService);
  private readonly templates = inject(StageTemplatesService);
  readonly templateOptions = signal<SelectOption[]>([]);
  readonly templateStageOptions = signal<SelectOption[]>([]);
  private templateStageNames = new Map<string, string>();

  constructor() {
    if (this.isEdit) return;
    this.templates
      .list()
      .pipe(catchError(() => of([])))
      .subscribe((list) =>
        this.templateOptions.set([
          { value: null, label: this.catalog.t('ps.noTemplate') },
          ...list.filter((t) => t.isActive).map((t) => ({ value: t.id, label: t.name })),
        ]),
      );
    this.form.controls.templateId.valueChanges.subscribe((id) => {
      this.form.controls.templateStageId.setValue(null);
      this.templateStageOptions.set([]);
      if (!id) return;
      this.templates
        .stages(id)
        .pipe(catchError(() => of([])))
        .subscribe((stages) => {
          this.templateStageNames = new Map(stages.map((st) => [st.id, st.name]));
          this.templateStageOptions.set(stages.map((st) => ({ value: st.id, label: st.name })));
        });
    });
    // A picked template stage names the new stage unless the user already typed a name.
    this.form.controls.templateStageId.valueChanges.subscribe((id) => {
      const name = id ? this.templateStageNames.get(id) : undefined;
      if (name && !this.form.controls.name.value.trim()) this.form.controls.name.setValue(name);
    });
  }

  readonly serverError = signal<ParsedApiError | null>(null);
  readonly submitting = signal(false);

  readonly endDateError = computed(() => {
    const ctrl = this.form.controls.estimatedEndDate;
    if (ctrl.touched && this.form.errors?.['dateRange']) return 'End must be on or after start.';
    return '';
  });

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
    const base = {
      name: v.name.trim(),
      order: Number(v.order),
      estimatedStartDate: v.estimatedStartDate || null,
      estimatedEndDate: v.estimatedEndDate || null,
      description: v.description.trim() || null,
      notes: v.notes.trim() || null,
    };
    const call = this.isEdit
      ? this.stages.update(
          this.data.projectId,
          this.data.stageId!,
          base satisfies UpdateProjectStageRequest,
        )
      : this.stages.create(this.data.projectId, {
          ...base,
          templateStageId: v.templateStageId || null,
        } satisfies CreateProjectStageRequest);
    call.subscribe({
      next: () => {
        this.toast.show({
          tone: 'success',
          message: this.isEdit ? 'Stage saved' : 'Stage created',
        });
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

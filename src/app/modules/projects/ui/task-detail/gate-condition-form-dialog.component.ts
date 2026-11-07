import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { catchError, of } from 'rxjs';
import { TaskGateConditionService } from '../../data/task-gate-condition.service';
import { StageGateConditionService } from '../../data/stage-gate-condition.service';
import { ProjectTaskService } from '../../data/project-task.service';
import { ProjectStageService } from '../../data/project-stage.service';
import { ErrorHandlerService, friendly } from '@platform/http/error-handler.service';
import { ToastService } from '@platform/feedback/toast.service';
import { HttpErrorResponse } from '@angular/common/http';
import { CatalogService } from '@platform/i18n/catalog.service';
import { GateNotRecreatableError, GateRemovedError } from '../../data/project.service';
import { ApprovalType, ConditionType, GateTrigger } from '../../model/project.model';
import { ParsedApiError } from '@platform/types';
import { ServerErrorsDirective, firstErrorMessage } from '@shared/forms';
import {
  PERA_MODAL_DATA,
  PeraFormFieldComponent,
  PeraFormModalComponent,
  PeraInputComponent,
  PeraModalRef,
  PeraSegmentedComponent,
  PeraSelectComponent,
  SegmentedOption,
  SelectOption,
} from '@ds';

export interface GateConditionFormDialogData {
  mode: 'create' | 'edit';
  /** Task vs stage selects the endpoint + body shape (api-docs/08). */
  ownerKind: 'task' | 'stage';
  ownerId: string;
  projectId: string;
  gateId?: string;
  initial?: {
    conditionType: ConditionType;
    trigger: GateTrigger;
    label: string;
    approvalType: ApprovalType | null;
    referencedTaskId: string | null;
    referencedStageId: string | null;
    referencedDocumentId?: string | null;
  };
}

const TRIGGER_OPTIONS: SegmentedOption[] = [
  { value: 'Unlock', label: 'Unlock' },
  { value: 'Complete', label: 'Complete' },
];

/**
 * Create / edit a gate condition (DMS Forms · Gate condition). On create the
 * design shows type / trigger / label / approval-type; the backend additionally
 * requires a **referenced task** (Task gates) or **referenced stage** (Stage
 * gates), so those conditional selects are kept here — omitting them would post a
 * body the API rejects. Edit only mutates label + trigger (type is immutable).
 */
@Component({
  selector: 'app-gate-condition-form-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    ServerErrorsDirective,
    PeraFormModalComponent,
    PeraFormFieldComponent,
    PeraInputComponent,
    PeraSelectComponent,
    PeraSegmentedComponent,
  ],
  template: `
    <pera-form-modal
      [eyebrow]="isEdit ? 'PUT /api/' + endpointBase + '/{id}' : 'POST /api/' + endpointBase"
      [title]="isEdit ? 'Edit gate condition' : 'New gate condition'"
      [subtitle]="
        isEdit
          ? 'Only the label and trigger are mutable once a gate exists.'
          : 'Block a stage or task from unlocking / completing until this clears.'
      "
      [permission]="permission"
      [submitLabel]="isEdit ? 'Save changes' : 'Add gate condition'"
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
          <pera-form-field class="col-span-2" label="Condition type" [required]="true">
            <pera-segmented
              formControlName="conditionType"
              [options]="typeOptions()"
              ariaLabel="Condition type"
            />
          </pera-form-field>

          @if (condType() === 'Task') {
            <pera-form-field
              class="col-span-2"
              label="Referenced task"
              [required]="true"
              hint="Must be completed before this gate is satisfied."
              [error]="errorOf('referencedTaskId')"
            >
              <pera-select
                formControlName="referencedTaskId"
                [options]="taskOptions()"
                placeholder="Select a task"
                [error]="errorOf('referencedTaskId')"
              />
            </pera-form-field>
          }
          @if (condType() === 'Stage') {
            <pera-form-field
              class="col-span-2"
              label="Referenced stage"
              [required]="true"
              hint="Must be completed before this gate is satisfied."
              [error]="errorOf('referencedStageId')"
            >
              <pera-select
                formControlName="referencedStageId"
                [options]="stageOptions()"
                placeholder="Select a stage"
                [error]="errorOf('referencedStageId')"
              />
            </pera-form-field>
          }
          @if (condType() === 'Approval') {
            <pera-form-field
              class="col-span-2"
              label="Approval type"
              [required]="true"
              [error]="errorOf('approvalType')"
            >
              <pera-select
                formControlName="approvalType"
                [options]="approvalOptions"
                placeholder="Select an approval type"
                [error]="errorOf('approvalType')"
              />
            </pera-form-field>
          }
        }

        <pera-form-field class="col-span-2" label="Trigger" [required]="true">
          <pera-segmented
            formControlName="trigger"
            [options]="triggerOptions"
            ariaLabel="Trigger"
          />
        </pera-form-field>

        <pera-form-field
          class="col-span-2"
          label="Label"
          [required]="true"
          [error]="errorOf('label')"
        >
          <pera-input
            formControlName="label"
            placeholder="Client sign-off on concept"
            [error]="errorOf('label')"
          />
        </pera-form-field>
      </div>
    </pera-form-modal>
  `,
})
export class GateConditionFormDialogComponent {
  private readonly fb = inject(FormBuilder);
  private readonly taskGates = inject(TaskGateConditionService);
  private readonly stageGates = inject(StageGateConditionService);
  private readonly tasksApi = inject(ProjectTaskService);
  private readonly stagesApi = inject(ProjectStageService);
  private readonly errorHandler = inject(ErrorHandlerService);
  private readonly toast = inject(ToastService);
  private readonly catalog = inject(CatalogService);
  private readonly modalRef = inject(PeraModalRef) as PeraModalRef<boolean>;
  readonly data = inject(PERA_MODAL_DATA) as GateConditionFormDialogData;

  readonly isEdit = this.data.mode === 'edit';
  readonly endpointBase =
    this.data.ownerKind === 'task' ? 'task-gate-conditions' : 'stage-gate-conditions';
  readonly permission = this.data.ownerKind === 'task' ? 'stage_tasks.manage' : 'stages.manage';

  readonly approvalOptions: SelectOption[] = [
    { value: 'ManagerApproval', label: 'Manager approval' },
    { value: 'ClientReview', label: 'Client review' },
  ];
  readonly triggerOptions = TRIGGER_OPTIONS;
  readonly typeOptions = computed<SegmentedOption[]>(() => {
    const base: SegmentedOption[] = [{ value: 'Task', label: 'Task' }];
    if (this.data.ownerKind === 'stage') base.push({ value: 'Stage', label: 'Stage' });
    base.push(
      { value: 'Approval', label: 'Approval' },
      { value: 'ManualCheck', label: 'Manual' },
      { value: 'Attachment', label: 'Attachment' },
    );
    return base;
  });

  readonly taskOptions = signal<SelectOption[]>([]);
  readonly stageOptions = signal<SelectOption[]>([]);

  readonly form = this.fb.nonNullable.group({
    conditionType: [
      this.data.initial?.conditionType ?? ('Task' as ConditionType),
      [Validators.required],
    ],
    trigger: [this.data.initial?.trigger ?? ('Complete' as GateTrigger), [Validators.required]],
    label: [this.data.initial?.label ?? '', [Validators.required, Validators.maxLength(300)]],
    approvalType: [this.data.initial?.approvalType ?? (null as ApprovalType | null)],
    referencedTaskId: [this.data.initial?.referencedTaskId ?? (null as string | null)],
    referencedStageId: [this.data.initial?.referencedStageId ?? (null as string | null)],
  });

  readonly condType = signal<ConditionType>(this.form.controls.conditionType.value);
  readonly serverError = signal<ParsedApiError | null>(null);
  readonly submitting = signal(false);

  constructor() {
    this.applyConditionalValidators(this.condType());
    this.form.controls.conditionType.valueChanges.pipe(takeUntilDestroyed()).subscribe((t) => {
      this.condType.set(t);
      this.applyConditionalValidators(t);
    });

    if (!this.isEdit) {
      this.tasksApi
        .getByProject(this.data.projectId)
        .pipe(catchError(() => of([])))
        .subscribe((tasks) =>
          this.taskOptions.set(
            tasks
              .filter((t) => !(this.data.ownerKind === 'task' && t.id === this.data.ownerId))
              .map((t) => ({ value: t.id, label: t.name })),
          ),
        );
      this.stagesApi
        .getByProject(this.data.projectId)
        .pipe(catchError(() => of([])))
        .subscribe((stages) =>
          this.stageOptions.set(
            stages
              .filter((s) => !(this.data.ownerKind === 'stage' && s.id === this.data.ownerId))
              .map((s) => ({ value: s.id, label: s.name })),
          ),
        );
    }
  }

  /** Referenced task / stage / approval-type are required only for their type. */
  private applyConditionalValidators(t: ConditionType): void {
    const set = (
      name: 'referencedTaskId' | 'referencedStageId' | 'approvalType',
      required: boolean,
    ) => {
      const c = this.form.controls[name];
      if (required) c.addValidators(Validators.required);
      else c.removeValidators(Validators.required);
      c.updateValueAndValidity({ emitEvent: false });
    };
    set('referencedTaskId', !this.isEdit && t === 'Task');
    set('referencedStageId', !this.isEdit && t === 'Stage');
    set('approvalType', !this.isEdit && t === 'Approval');
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

    // crmp A-2: no update route — an edit deletes the gate and re-creates it with the same type and
    // references (gap table REMOVED P-73/100).
    const kind = this.isEdit ? this.data.initial : undefined;
    const conditionType = kind?.conditionType ?? v.conditionType;
    const req = {
      conditionType,
      trigger: v.trigger,
      label: v.label.trim(),
      referencedTaskId:
        conditionType === 'Task' ? (kind?.referencedTaskId ?? v.referencedTaskId) : null,
      referencedStageId:
        conditionType === 'Stage' ? (kind?.referencedStageId ?? v.referencedStageId) : null,
      referencedDocumentId: kind?.referencedDocumentId ?? null,
      approvalType: conditionType === 'Approval' ? (kind?.approvalType ?? v.approvalType) : null,
    };
    const svc = this.data.ownerKind === 'task' ? this.taskGates : this.stageGates;
    const call =
      this.isEdit && this.data.gateId
        ? svc.recreate(this.data.projectId, this.data.ownerId, this.data.gateId, req)
        : svc.create(this.data.projectId, this.data.ownerId, req);

    call.subscribe({
      next: () => {
        this.toast.show({ tone: 'success', message: this.isEdit ? 'Gate saved' : 'Gate created' });
        this.modalRef.close(true);
      },
      error: (err: unknown) => {
        if (err instanceof GateNotRecreatableError) {
          this.serverError.set({
            status: 400,
            generalMessage: this.catalog.t('gates.notRecreatable'),
            fieldErrors: {},
            code: null,
            raw: null,
          });
          this.submitting.set(false);
          return;
        }
        if (err instanceof GateRemovedError) {
          // R1-F4: the delete went through and the re-create did not — the old gate is gone.
          const reason =
            err.cause instanceof HttpErrorResponse
              ? friendly(this.errorHandler.parse(err.cause))
              : '';
          this.toast.show({
            tone: 'danger',
            message: this.catalog.t('gates.removedNotRecreated', { reason }),
          });
          this.modalRef.close(true);
          return;
        }
        const parsed = this.errorHandler.parse(err as HttpErrorResponse);
        this.serverError.set({ ...parsed, generalMessage: friendly(parsed) });
        this.submitting.set(false);
      },
    });
  }
}

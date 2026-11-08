import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import {
  AbstractControl,
  FormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { catchError, of } from 'rxjs';
import { ProjectTaskService } from '../../data/project-task.service';
import { ProjectStageService } from '../../data/project-stage.service';
import { ErrorHandlerService, friendly } from '@platform/http/error-handler.service';
import { ToastService } from '@platform/feedback/toast.service';
import {
  CreateProjectTaskRequest,
  TaskPriority,
  UpdateProjectTaskRequest,
} from '../../model/project.model';
import { ParsedApiError } from '@platform/types';
import { EmployeeService } from '@modules/people';
import { ServerErrorsDirective, firstErrorMessage } from '@shared/forms';
import {
  PERA_MODAL_DATA,
  PeraDateInputComponent,
  PeraFormFieldComponent,
  PeraFormModalComponent,
  PeraInputComponent,
  PeraModalRef,
  PeraSegmentedComponent,
  PeraSelectComponent,
  PeraTextareaComponent,
  SegmentedOption,
  SelectOption,
} from '@ds';

export interface TaskFormDialogData {
  mode: 'create' | 'edit';
  projectId: string;
  /** Preselected stage for create (e.g. launched from a stage panel). */
  projectStageId?: string | null;
  nextOrder?: number;
  taskId?: string;
  initial?: {
    name: string;
    order: number;
    weight: number;
    priority: TaskPriority;
    estimatedStartDate: string | null;
    dueDate: string | null;
    description: string | null;
    notes: string | null;
  };
}

/** Weight must be strictly greater than 0 (design rule). */
function weightPositive(control: AbstractControl): ValidationErrors | null {
  const v = control.value;
  if (v === null || v === undefined || v === '') return null;
  const num = Number(v);
  if (Number.isNaN(num)) return { numeric: true };
  return num > 0 ? null : { weightPositive: true };
}

/**
 * Create / edit a project task (DMS Forms · Task). Create offers stage +
 * assignee; edit drops both (assignment and status have their own actions per
 * the handoff). Priority is single-select chips. Create posts `startDate`; edit
 * sends `estimatedStartDate` — matching the two DTOs exactly.
 */
@Component({
  selector: 'app-task-form-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    ServerErrorsDirective,
    PeraFormModalComponent,
    PeraFormFieldComponent,
    PeraInputComponent,
    PeraTextareaComponent,
    PeraSelectComponent,
    PeraSegmentedComponent,
    PeraDateInputComponent,
  ],
  template: `
    <pera-form-modal
      [eyebrow]="isEdit ? 'PUT /api/project-tasks/{id}' : 'POST /api/project-tasks'"
      [title]="isEdit ? 'Edit task' : 'New task'"
      [subtitle]="
        isEdit
          ? 'Update name, weight, priority and planned dates. Assignment and status have their own actions.'
          : 'Add a task to a stage (Stage projects) or unstaged (FreeStyle).'
      "
      permission="stage_tasks.manage"
      [submitLabel]="isEdit ? 'Save changes' : 'Create task'"
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
        <pera-form-field
          class="col-span-2"
          label="Task name"
          [required]="true"
          [error]="errorOf('name')"
        >
          <pera-input
            formControlName="name"
            placeholder="Issue redlined floor plan"
            [error]="errorOf('name')"
          />
        </pera-form-field>

        @if (!isEdit && stageOptions().length) {
          <pera-form-field
            class="col-span-2"
            label="Stage"
            [required]="true"
            hint="Required for Stage projects"
            [error]="errorOf('projectStageId')"
          >
            <pera-select
              formControlName="projectStageId"
              [options]="stageOptions()"
              placeholder="Select a stage"
              [error]="errorOf('projectStageId')"
            />
          </pera-form-field>
        }

        <pera-form-field label="Order" [required]="true" [error]="errorOf('order')">
          <pera-input type="number" formControlName="order" [error]="errorOf('order')" />
        </pera-form-field>
        <pera-form-field
          label="Weight"
          [required]="true"
          hint="Greater than 0 · wt"
          [error]="errorOf('weight')"
        >
          <pera-input type="number" formControlName="weight" [error]="errorOf('weight')" />
        </pera-form-field>

        <pera-form-field class="col-span-2" label="Priority" [required]="true">
          <pera-segmented
            formControlName="priority"
            [options]="priorityOptions"
            ariaLabel="Priority"
          />
        </pera-form-field>

        @if (!isEdit) {
          <pera-form-field class="col-span-2" label="Assignee" hint="optional">
            <pera-select
              formControlName="assignedToId"
              [options]="assigneeOptions()"
              placeholder="Unassigned"
            />
          </pera-form-field>
        }

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
        <pera-form-field label="Due date" hint="optional" [error]="errorOf('dueDate')">
          <pera-date-input formControlName="dueDate" [error]="errorOf('dueDate')" />
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
export class TaskFormDialogComponent {
  private readonly fb = inject(FormBuilder);
  private readonly tasks = inject(ProjectTaskService);
  private readonly stages = inject(ProjectStageService);
  private readonly directory = inject(EmployeeService);
  private readonly errorHandler = inject(ErrorHandlerService);
  private readonly toast = inject(ToastService);
  private readonly modalRef = inject(PeraModalRef) as PeraModalRef<boolean>;
  readonly data = inject(PERA_MODAL_DATA) as TaskFormDialogData;

  readonly isEdit = this.data.mode === 'edit';

  readonly priorityOptions: SegmentedOption[] = [
    { value: 'Low', label: 'Low' },
    { value: 'Medium', label: 'Medium' },
    { value: 'High', label: 'High' },
    { value: 'Urgent', label: 'Urgent' },
  ];

  readonly stageOptions = signal<SelectOption[]>([]);
  readonly assigneeOptions = signal<SelectOption[]>([]);

  readonly form = this.fb.nonNullable.group({
    name: [this.data.initial?.name ?? '', [Validators.required, Validators.maxLength(200)]],
    projectStageId: [this.data.projectStageId ?? (null as string | null)],
    order: [String(this.data.initial?.order ?? this.data.nextOrder ?? 10), [Validators.required]],
    weight: [String(this.data.initial?.weight ?? 1), [Validators.required, weightPositive]],
    priority: [this.data.initial?.priority ?? ('Medium' as TaskPriority), [Validators.required]],
    assignedToId: [null as string | null],
    estimatedStartDate: [this.data.initial?.estimatedStartDate ?? ''],
    dueDate: [this.data.initial?.dueDate ?? ''],
    description: [this.data.initial?.description ?? '', [Validators.maxLength(2000)]],
    notes: [this.data.initial?.notes ?? '', [Validators.maxLength(1000)]],
  });

  readonly serverError = signal<ParsedApiError | null>(null);
  readonly submitting = signal(false);

  constructor() {
    if (!this.isEdit) {
      this.stages
        .getByProject(this.data.projectId)
        .pipe(catchError(() => of([])))
        .subscribe((list) => {
          this.stageOptions.set(list.map((s) => ({ value: s.id, label: s.name })));
          // Stage is required only for Stage-workflow projects (i.e. when stages exist).
          if (list.length) {
            this.form.controls.projectStageId.addValidators(Validators.required);
            this.form.controls.projectStageId.updateValueAndValidity({ emitEvent: false });
          }
        });
      this.directory
        .listPaged({ page: 1, pageSize: 500, isActive: true })
        .pipe(catchError(() => of(null)))
        .subscribe((paged) =>
          this.assigneeOptions.set(
            (paged?.items ?? []).map((e) => ({ value: e.id, label: e.fullName })),
          ),
        );
    }
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

    const call = this.isEdit
      ? this.tasks.update(this.data.projectId, this.data.taskId!, {
          name: v.name.trim(),
          order: Number(v.order),
          weight: Number(v.weight),
          priority: v.priority,
          dueDate: v.dueDate || null,
          description: v.description.trim() || null,
          notes: v.notes.trim() || null,
        } satisfies UpdateProjectTaskRequest)
      : this.tasks.create(this.data.projectId, {
          name: v.name.trim(),
          order: Number(v.order),
          weight: Number(v.weight),
          priority: v.priority,
          projectStageId: v.projectStageId || null,
          assignedToId: v.assignedToId || null,
          dueDate: v.dueDate || null,
          description: v.description.trim() || null,
          notes: v.notes.trim() || null,
        } satisfies CreateProjectTaskRequest);

    call.subscribe({
      next: () => {
        this.toast.show({ tone: 'success', message: this.isEdit ? 'Task saved' : 'Task created' });
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

import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { catchError, forkJoin, of } from 'rxjs';
import { StageTeamMemberRole, StageTeamsService } from '../../data/stage-teams.service';
import { DepartmentService, EmployeeService } from '@modules/people';
import { ErrorHandlerService, friendly } from '@platform/http/error-handler.service';
import { ToastService } from '@platform/feedback/toast.service';
import { ParsedApiError } from '@platform/types';
import { ServerErrorsDirective, firstErrorMessage } from '@shared/forms';
import {
  PERA_MODAL_DATA,
  PeraFormFieldComponent,
  PeraFormModalComponent,
  PeraModalRef,
  PeraSegmentedComponent,
  PeraSelectComponent,
  SegmentedOption,
  SelectOption,
} from '@ds';

export interface MemberFormDialogData {
  mode: 'create' | 'edit';
  projectId: string;
  /** Preselected/contextual stage team for create. */
  stageTeamId?: string | null;
  /** Edit: the stage-team member id + current role. */
  memberId?: string;
  initial?: { role: string };
}

/**
 * Add a member to a stage team, or change a member's role (DMS Forms · Team
 * member). Project membership is aggregated from stage teams, so this binds the
 * **real** endpoints — `POST /api/stage-teams/members` and
 * `PUT /api/stage-teams/members/{id}/role` — not the design's
 * `/api/project-members/{id}/access`, which has no backend route (404 gap; see
 * docs/STAGE_TASK_BACKEND_GAPS.md). The field is the stage-team **role**, not the
 * design's Viewer/Contributor/Manager "access" (a different, unwired enum).
 */
@Component({
  selector: 'app-member-form-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    ServerErrorsDirective,
    PeraFormModalComponent,
    PeraFormFieldComponent,
    PeraSelectComponent,
    PeraSegmentedComponent,
  ],
  template: `
    <pera-form-modal
      [eyebrow]="
        isEdit ? 'PUT /api/stage-teams/members/{id}/role' : 'POST /api/stage-teams/members'
      "
      [title]="isEdit ? 'Change role' : 'Add team member'"
      [subtitle]="subtitleText"
      permission="stage_teams.manage"
      [submitLabel]="isEdit ? 'Save changes' : 'Add member'"
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
          <pera-form-field
            class="col-span-2"
            label="Employee"
            [required]="true"
            [error]="errorOf('employeeId')"
          >
            <pera-select
              formControlName="employeeId"
              [options]="employeeOptions()"
              placeholder="Select an employee"
              [error]="errorOf('employeeId')"
            />
          </pera-form-field>
          <pera-form-field
            class="col-span-2"
            label="Stage team"
            [required]="true"
            [error]="errorOf('stageTeamId')"
          >
            <pera-select
              formControlName="stageTeamId"
              [options]="teamOptions()"
              placeholder="Select a stage team"
              [error]="errorOf('stageTeamId')"
            />
          </pera-form-field>
        }
        <pera-form-field class="col-span-2" label="Role" [required]="true">
          <pera-segmented formControlName="role" [options]="roleOptions" ariaLabel="Role" />
        </pera-form-field>
      </div>
    </pera-form-modal>
  `,
})
export class MemberFormDialogComponent {
  private readonly fb = inject(FormBuilder);
  private readonly teams = inject(StageTeamsService);
  private readonly directory = inject(EmployeeService);
  private readonly departments = inject(DepartmentService);
  private readonly errorHandler = inject(ErrorHandlerService);
  private readonly toast = inject(ToastService);
  private readonly modalRef = inject(PeraModalRef) as PeraModalRef<boolean>;
  readonly data = inject(PERA_MODAL_DATA) as MemberFormDialogData;

  readonly isEdit = this.data.mode === 'edit';
  readonly subtitleText = this.isEdit
    ? "Update this member's role on the stage team."
    : 'Project membership is aggregated from stage teams — add the person to a stage team.';

  readonly roleOptions: SegmentedOption[] = [
    { value: 'Member', label: 'Member' },
    { value: 'Lead', label: 'Lead' },
    { value: 'Reviewer', label: 'Reviewer' },
    { value: 'Contributor', label: 'Contributor' },
  ];

  readonly employeeOptions = signal<SelectOption[]>([]);
  readonly teamOptions = signal<SelectOption[]>([]);

  readonly form = this.fb.nonNullable.group({
    employeeId: [null as string | null, this.data.mode === 'create' ? [Validators.required] : []],
    stageTeamId: [
      this.data.stageTeamId ?? (null as string | null),
      this.data.mode === 'create' ? [Validators.required] : [],
    ],
    role: [this.data.initial?.role ?? 'Member', [Validators.required]],
  });

  readonly serverError = signal<ParsedApiError | null>(null);
  readonly submitting = signal(false);

  constructor() {
    if (!this.isEdit) {
      this.directory
        .listPaged({ page: 1, pageSize: 500, isActive: true })
        .pipe(catchError(() => of(null)))
        .subscribe((paged) =>
          this.employeeOptions.set(
            (paged?.items ?? []).map((e) => ({ value: e.id, label: e.fullName })),
          ),
        );
      // Sync W2-4: a team row may carry no department name — resolve it from the department list,
      // as project-teams.component.ts does, so the picker never reads "undefined · 3".
      forkJoin({
        list: this.teams.getByProject(this.data.projectId).pipe(catchError(() => of([]))),
        departments: this.departments.getAll().pipe(catchError(() => of([]))),
      }).subscribe(({ list, departments }) => {
        const deptById = new Map((departments ?? []).map((d) => [d.id, d.name]));
        this.teamOptions.set(
          list.map((t) => {
            const name = t.departmentName || deptById.get(t.departmentId) || t.departmentId;
            const count = t.memberCount || t.members?.length || 0;
            return { value: t.id, label: `${name} · ${count}` };
          }),
        );
      });
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
    const role = v.role as StageTeamMemberRole;
    const call = this.isEdit
      ? this.teams.changeMemberRole(this.data.projectId, this.data.memberId!, role)
      : this.teams.addMember(this.data.projectId, v.stageTeamId!, v.employeeId!, role);
    call.subscribe({
      next: () => {
        this.toast.show({
          tone: 'success',
          message: this.isEdit ? 'Role updated' : 'Member added',
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

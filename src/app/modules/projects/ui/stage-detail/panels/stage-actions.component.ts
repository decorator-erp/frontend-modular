import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { ProjectStageService } from '../../../data/project-stage.service';
import { StageLifecycleService } from '../../../data/stage-lifecycle.service';
import { ErrorHandlerService, friendly } from '@platform/http/error-handler.service';
import { ToastService } from '@platform/feedback/toast.service';
import { PERM } from '@platform/permissions';
import { CanDirective } from '@platform/permissions';
import { ApprovalType, ProjectStage } from '../../../model/project.model';
import {
  ConfirmService,
  ModalService,
  PERA_MODAL_DATA,
  PeraButtonComponent,
  PeraFormFieldComponent,
  PeraModalComponent,
  PeraModalFooterDirective,
  PeraModalRef,
  PeraSelectComponent,
  PeraTextareaComponent,
  SelectOption,
} from '@ds';

const APPROVAL_OPTIONS: SelectOption[] = [
  { value: 'ManagerApproval', label: 'Manager approval' },
  { value: 'ClientReview', label: 'Client review' },
];

export interface StageNoteModalData {
  title: string;
  label: string;
  required: boolean;
  confirmLabel: string;
  tone?: 'default' | 'danger';
  withApprovalType?: boolean;
  approvalRequired?: boolean;
}

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    PeraModalComponent,
    PeraModalFooterDirective,
    PeraFormFieldComponent,
    PeraSelectComponent,
    PeraTextareaComponent,
    PeraButtonComponent,
  ],
  template: `
    <pera-modal [title]="data.title" size="sm">
      <div class="flex flex-col gap-3">
        @if (data.withApprovalType) {
          <pera-form-field label="Approval type" [required]="data.approvalRequired ?? false">
            <pera-select
              [options]="options"
              [ngModel]="approvalType()"
              (ngModelChange)="approvalType.set($event)"
              [placeholder]="data.approvalRequired ? 'Select type' : 'Optional'"
            />
          </pera-form-field>
        }
        <pera-form-field [label]="data.label" [required]="data.required">
          <pera-textarea [ngModel]="note()" (ngModelChange)="note.set($event)" [rows]="3" />
        </pera-form-field>
      </div>
      <div peraModalFooter class="flex gap-2">
        <pera-button variant="ghost" (click)="ref.close()">Cancel</pera-button>
        <pera-button
          [variant]="data.tone === 'danger' ? 'danger' : 'primary'"
          [disabled]="!valid()"
          (click)="submit()"
        >
          {{ data.confirmLabel }}
        </pera-button>
      </div>
    </pera-modal>
  `,
})
export class StageNoteModalComponent {
  readonly ref = inject(PeraModalRef) as PeraModalRef<
    { note: string; approvalType: ApprovalType | null } | undefined
  >;
  readonly data = inject(PERA_MODAL_DATA) as StageNoteModalData;
  readonly options = APPROVAL_OPTIONS;
  readonly note = signal('');
  readonly approvalType = signal<ApprovalType | null>(
    this.data.approvalRequired ? 'ManagerApproval' : null,
  );

  valid(): boolean {
    if (this.data.required && !this.note().trim()) return false;
    if (this.data.approvalRequired && !this.approvalType()) return false;
    return true;
  }

  submit(): void {
    if (!this.valid()) return;
    this.ref.close({ note: this.note().trim(), approvalType: this.approvalType() });
  }
}

/** Stage lifecycle action row — Projects.ManageStages gated. */
@Component({
  selector: 'app-stage-actions',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CanDirective],
  template: `
    <ng-container *peraCan="manageStages">
      <div class="flex items-center gap-1.5 flex-wrap">
        @if (status() === 'Locked') {
          <button
            type="button"
            (click)="activate()"
            [disabled]="busy()"
            class="px-2.5 py-1.5 bg-accent text-text-on-accent border border-accent fs-label hover:bg-accent-hover disabled:opacity-50"
          >
            Activate
          </button>
        }
        @if (status() === 'Active') {
          <button
            type="button"
            (click)="complete()"
            [disabled]="busy()"
            class="px-2.5 py-1.5 bg-accent text-text-on-accent border border-accent fs-label hover:bg-accent-hover disabled:opacity-50 inline-flex items-center gap-1.5"
          >
            <svg
              width="11"
              height="11"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2.4"
            >
              <path d="M5 12l4 4L19 6" />
            </svg>
            Complete
          </button>
          <!-- TODO: no "Skip stage" — backend exposes no PUT /project-stages/{id}/skip.
               Needs a backend gap ticket before re-adding (CLAUDE_CODE_PROMPT.md Step 2). -->
          <button
            type="button"
            (click)="approve()"
            [disabled]="busy()"
            class="px-2.5 py-1.5 border border-success bg-success-soft text-success fs-label hover:opacity-80 disabled:opacity-50"
          >
            Approve
          </button>
          <button
            type="button"
            (click)="reject()"
            [disabled]="busy()"
            class="px-2.5 py-1.5 border border-danger bg-danger-soft text-danger fs-label hover:opacity-80 disabled:opacity-50"
          >
            Reject
          </button>
        }
        <button
          type="button"
          (click)="remove()"
          [disabled]="busy()"
          class="px-2.5 py-1.5 border border-border bg-bg fs-label text-danger hover:bg-danger-soft hover:border-danger disabled:opacity-50"
        >
          Delete
        </button>
      </div>
    </ng-container>
  `,
})
export class StageActionsComponent {
  readonly stage = input.required<ProjectStage>();
  readonly changed = output<void>();
  readonly deleted = output<void>();

  private readonly stagesApi = inject(ProjectStageService);
  private readonly lifecycle = inject(StageLifecycleService);
  private readonly errors = inject(ErrorHandlerService);
  private readonly toast = inject(ToastService);
  private readonly modal = inject(ModalService);
  private readonly confirm = inject(ConfirmService);

  readonly manageStages = PERM.stages.manage;
  readonly busy = signal(false);

  readonly status = computed(() => this.stage().status as string);

  activate(): void {
    this.run(this.stagesApi.activate(this.stage().id), 'Stage activated');
  }

  async complete(): Promise<void> {
    const result = await this.openNote({
      title: 'Complete stage',
      label: 'Notes',
      required: false,
      confirmLabel: 'Complete stage',
    });
    if (!result) return;
    this.run(
      this.stagesApi.complete(this.stage().id, { notes: result.note || null }),
      'Stage completed',
    );
  }

  // TODO: skip() removed — backend has no /project-stages/{id}/skip route.
  // Raise a backend gap ticket if a "Skip stage" transition is required.

  async approve(): Promise<void> {
    const result = await this.openNote({
      title: 'Approve stage',
      label: 'Note',
      required: false,
      confirmLabel: 'Approve',
      withApprovalType: true,
      approvalRequired: true,
    });
    if (!result || !result.approvalType) return;
    this.run(
      this.lifecycle.approve(this.stage().id, result.approvalType, result.note || null),
      'Stage approved',
    );
  }

  async reject(): Promise<void> {
    const result = await this.openNote({
      title: 'Reject stage',
      label: 'Reason',
      required: true,
      confirmLabel: 'Reject',
      tone: 'danger',
      withApprovalType: true,
    });
    if (!result) return;
    this.run(
      this.lifecycle.reject(this.stage().id, result.note, result.approvalType),
      'Stage rejected',
    );
  }

  async remove(): Promise<void> {
    const ok = await this.confirm.open({
      title: 'Delete stage',
      body: `Delete "${this.stage().name}" and its tasks? This cannot be undone.`,
      confirmLabel: 'Delete',
      tone: 'danger',
    });
    if (!ok) return;
    this.busy.set(true);
    this.stagesApi.remove(this.stage().id).subscribe({
      next: () => {
        this.busy.set(false);
        this.toast.show({ tone: 'success', message: 'Stage deleted' });
        this.deleted.emit();
      },
      error: (err: HttpErrorResponse) => {
        this.busy.set(false);
        this.toast.show({ tone: 'danger', message: friendly(this.errors.parse(err)) });
      },
    });
  }

  private openNote(
    data: StageNoteModalData,
  ): Promise<{ note: string; approvalType: ApprovalType | null } | undefined> {
    return this.modal
      .open<{
        note: string;
        approvalType: ApprovalType | null;
      }>(StageNoteModalComponent, { size: 'sm', data })
      .afterClosed();
  }

  private run(call: ReturnType<ProjectStageService['activate']>, successMessage: string): void {
    if (this.busy()) return;
    this.busy.set(true);
    call.subscribe({
      next: () => {
        this.busy.set(false);
        this.toast.show({ tone: 'success', message: successMessage });
        this.changed.emit();
      },
      error: (err: HttpErrorResponse) => {
        this.busy.set(false);
        this.toast.show({ tone: 'danger', message: friendly(this.errors.parse(err)) });
      },
    });
  }
}

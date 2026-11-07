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
import { Observable } from 'rxjs';
import { ProjectTaskService } from '../../data/project-task.service';
import { ErrorHandlerService, friendly } from '@platform/http/error-handler.service';
import { ToastService } from '@platform/feedback/toast.service';
import { PERM } from '@platform/permissions';
import { CanDirective } from '@platform/permissions';
import { ProjectTask } from '../../model/project.model';
import {
  ConfirmService,
  ModalService,
  PeraButtonComponent,
  PeraFormFieldComponent,
  PeraModalComponent,
  PeraModalFooterDirective,
  PeraModalRef,
  PeraTextareaComponent,
} from '@ds';

/** Reject modal — `POST …/tasks/{taskId}/reject { reason }` (dms `TaskEndpoints.cs:106,225`). */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    PeraModalComponent,
    PeraModalFooterDirective,
    PeraFormFieldComponent,
    PeraTextareaComponent,
    PeraButtonComponent,
  ],
  template: `
    <pera-modal title="Reject task" size="sm">
      <div class="flex flex-col gap-3">
        <pera-form-field label="Reason" [required]="true">
          <pera-textarea
            [ngModel]="note()"
            (ngModelChange)="note.set($event)"
            placeholder="Why is this task being rejected?"
            [rows]="3"
          />
        </pera-form-field>
      </div>
      <div peraModalFooter class="flex gap-2">
        <pera-button variant="ghost" (click)="ref.close()">Cancel</pera-button>
        <pera-button variant="danger" [disabled]="!note().trim()" (click)="submit()"
          >Reject</pera-button
        >
      </div>
    </pera-modal>
  `,
})
export class TaskRejectModalComponent {
  readonly ref = inject(PeraModalRef) as PeraModalRef<{ note: string } | undefined>;
  readonly note = signal('');

  submit(): void {
    if (!this.note().trim()) return;
    this.ref.close({ note: this.note().trim() });
  }
}

/**
 * Task lifecycle transition buttons (A-05 status row) per the ProjectTask
 * lifecycle in api-docs/07-project-stages-tasks.md. Every action requires
 * Projects.ManageTasks; buttons render only when the current status allows the
 * transition (Locked tasks have no actions — gates must be satisfied first).
 */
@Component({
  selector: 'app-task-status-actions',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CanDirective],
  template: `
    <ng-container *peraCan="manageTasks">
      <div class="flex items-center gap-1.5 flex-wrap">
        @if (status() === 'Locked') {
          <span
            class="font-mono fs-label uppercase text-text-muted px-2 py-1.5 border border-border-soft bg-bg"
          >
            Locked — satisfy gates to unlock
          </span>
        }
        @if (status() === 'Open' || status() === 'Rejected') {
          <button
            type="button"
            (click)="start()"
            [disabled]="busy()"
            class="px-2.5 py-1.5 border border-border bg-bg fs-label hover:bg-surface-muted disabled:opacity-50"
          >
            Start
          </button>
        }
        @if (status() === 'InProgress') {
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
            Mark complete
          </button>
        }
        @if (status() === 'PendingApproval') {
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
export class TaskStatusActionsComponent {
  readonly task = input.required<ProjectTask>();
  readonly changed = output<void>();
  readonly deleted = output<void>();

  private readonly tasksApi = inject(ProjectTaskService);
  private readonly errors = inject(ErrorHandlerService);
  private readonly toast = inject(ToastService);
  private readonly modal = inject(ModalService);
  private readonly confirm = inject(ConfirmService);

  readonly manageTasks = PERM.stageTasks.manage;
  readonly busy = signal(false);

  /** Backend exposes PendingApproval/Rejected beyond the local union — compare as string. */
  readonly status = computed(() => this.task().status as string);

  // crmp A-2: the transitions are POSTs under the project (dms `TaskEndpoints.cs:81-123`). Request
  // approval and Approve are gone: the backend has no such routes; approval runs through Approval
  // gates decided in the approvals inbox (gap table REMOVED P-103/104).
  start(): void {
    const t = this.task();
    this.run(this.tasksApi.start(t.projectId, t.id), 'Task started');
  }

  complete(): void {
    const t = this.task();
    this.run(this.tasksApi.complete(t.projectId, t.id), 'Task completed');
  }

  async reject(): Promise<void> {
    const result = await this.modal
      .open<{ note: string }>(TaskRejectModalComponent, { size: 'sm' })
      .afterClosed();
    if (!result) return;
    const t = this.task();
    this.run(this.tasksApi.reject(t.projectId, t.id, result.note), 'Task rejected');
  }

  async remove(): Promise<void> {
    const ok = await this.confirm.open({
      title: 'Delete task',
      body: `Delete "${this.task().name}"? This cannot be undone.`,
      confirmLabel: 'Delete',
      tone: 'danger',
    });
    if (!ok) return;
    this.busy.set(true);
    this.tasksApi.remove(this.task().projectId, this.task().id).subscribe({
      next: () => {
        this.busy.set(false);
        this.toast.show({ tone: 'success', message: 'Task deleted' });
        this.deleted.emit();
      },
      error: (err: HttpErrorResponse) => {
        this.busy.set(false);
        this.toast.show({ tone: 'danger', message: friendly(this.errors.parse(err)) });
      },
    });
  }

  private run(call: Observable<unknown>, successMessage: string): void {
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
        // tasks.StillLocked / CompletionBlocked / SubTasksIncomplete /
        // MissingRequiredAttachments / ApprovalNotAuthorized etc. per api-docs/07.
        this.toast.show({ tone: 'danger', message: friendly(this.errors.parse(err)) });
      },
    });
  }
}

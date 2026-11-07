import { ChangeDetectionStrategy, Component, OnInit, inject, input, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { ProjectSubTaskService } from '../../data/project-subtask.service';
import { ErrorHandlerService, friendly } from '@platform/http/error-handler.service';
import { ToastService } from '@platform/feedback/toast.service';
import { PERM } from '@platform/permissions';
import { CanDirective } from '@platform/permissions';
import { ProjectSubTask } from '../../model/project.model';
import type { ProjectAction } from '../../model/project-actions';
import { ProjectAccessStore } from '../../stores/project-access.store';
import { CatalogService } from '@platform/i18n/catalog.service';
import { ConfirmService, ModalService } from '@ds';
import { SubtaskFormDialogComponent, SubtaskFormDialogData } from './subtask-form-dialog.component';

/**
 * Subtasks checklist panel (A-08 pattern) — `/api/projects/{projectId}/tasks/{taskId}/sub-tasks` (crmp A-2; was `/api/project-subtasks`) per
 * api-docs/07-project-stages-tasks.md. Mutations gated by Projects.ManageTasks.
 * Create / edit open the DMS Forms sub-task dialog; the row keeps the inline
 * done-toggle + delete.
 */
@Component({
  selector: 'app-subtasks-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CanDirective],
  template: `
    <!-- progress -->
    <div class="flex items-center gap-2.5 px-4 py-3 border-b border-border-soft">
      <span class="relative flex-1 h-bar-track bg-border-soft">
        <span class="absolute inset-y-0 start-0 bg-text-primary" [style.width.%]="subPct()"></span>
      </span>
      <span class="fs-label text-text-secondary tabular-nums min-w-16 text-end"
        >{{ doneCount() }}/{{ subtasks().length }}</span
      >
    </div>
    @for (sub of subtasks(); track sub.id) {
      <div
        class="group flex items-center gap-3 px-4 py-2.5 border-b border-border-soft last:border-b-0 transition-colors hover:bg-surface-muted"
      >
        @if (canManage()) {
          <!-- Real (visually-hidden) checkbox keeps the row keyboard-accessible; the box is its visual proxy. -->
          <label class="flex items-center cursor-pointer shrink-0">
            <input
              type="checkbox"
              class="sr-only peer"
              [checked]="sub.isDone"
              [disabled]="busy()"
              (change)="toggle(sub)"
            />
            <span
              class="w-icon-xs h-icon-xs inline-flex items-center justify-center border fs-label leading-none
                         peer-focus-visible:outline peer-focus-visible:outline-1 peer-focus-visible:outline-accent"
              [class.bg-text-primary]="sub.isDone"
              [class.border-text-primary]="sub.isDone"
              [class.text-bg]="sub.isDone"
              [class.bg-bg]="!sub.isDone"
              [class.border-text-muted]="!sub.isDone"
              [class.text-transparent]="!sub.isDone"
            >
              @if (sub.isDone) {
                <svg
                  width="11"
                  height="11"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="3"
                >
                  <path d="M5 12l4 4L19 6" />
                </svg>
              }
            </span>
          </label>
        } @else {
          <span
            class="w-icon-xs h-icon-xs inline-flex items-center justify-center border shrink-0 fs-label leading-none"
            [class.bg-text-primary]="sub.isDone"
            [class.border-text-primary]="sub.isDone"
            [class.text-bg]="sub.isDone"
            [class.bg-bg]="!sub.isDone"
            [class.border-text-muted]="!sub.isDone"
            [class.text-transparent]="!sub.isDone"
          >
            @if (sub.isDone) {
              <svg
                width="11"
                height="11"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="3"
              >
                <path d="M5 12l4 4L19 6" />
              </svg>
            }
          </span>
        }
        <span
          class="flex-1 fs-caption text-text-primary"
          [class.line-through]="sub.isDone"
          [class.text-text-muted]="sub.isDone"
          >{{ sub.title }}</span
        >
        @if (sub.isRequired) {
          <span
            class="inline-flex items-center fs-micro font-semibold tracking-[0.03em] px-1.5 py-0.5 border border-warning bg-warning-soft text-warning"
            >REQUIRED</span
          >
        } @else {
          <!-- crmp P-5: only required sub-tasks block the task's completion (tasks.SubTasksIncomplete). -->
          <span
            class="inline-flex items-center fs-micro px-1.5 py-0.5 border border-border-soft text-text-muted"
            data-optional
            >{{ catalog.t('psub.optional') }}</span
          >
        }
        <span
          class="opacity-0 group-hover:opacity-100 flex items-center gap-1.5 font-mono fs-micro text-text-muted uppercase transition-opacity"
        >
          <ng-container *peraCan="can('subtask.update') ? manageTasks : []">
            <button type="button" class="hover:text-accent" (click)="openEdit(sub)">Edit</button>
            <span class="text-border">·</span>
            @if (!sub.isDone && can('subtask.delete')) {
              <button type="button" class="hover:text-danger" (click)="remove(sub)" data-delete>
                Delete
              </button>
            }
          </ng-container>
        </span>
      </div>
    } @empty {
      <p class="m-0 px-4 py-3 fs-caption text-text-muted">
        No subtasks yet. Break this task down to make progress visible.
      </p>
    }
    <!-- Create — opens the DMS Forms sub-task dialog (CreateProjectSubTaskRequest) -->
    <ng-container *peraCan="can('subtask.create') ? manageTasks : []">
      <div class="px-4 py-2.5">
        <button
          type="button"
          (click)="openCreate()"
          [disabled]="busy()"
          class="inline-flex items-center gap-1.5 px-3 py-1.5 border border-border bg-bg fs-caption font-medium cursor-pointer
                       hover:bg-surface-muted disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          <svg
            width="13"
            height="13"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            class="text-text-muted"
          >
            <path d="M12 5v14M5 12h14" />
          </svg>
          New sub-task
        </button>
      </div>
    </ng-container>
  `,
})
export class SubtasksPanelComponent implements OnInit {
  readonly projectId = input.required<string>();
  readonly taskId = input.required<string>();

  private readonly api = inject(ProjectSubTaskService);
  private readonly errors = inject(ErrorHandlerService);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmService);
  private readonly modal = inject(ModalService);
  private readonly access = inject(ProjectAccessStore);
  protected readonly catalog = inject(CatalogService);

  readonly manageTasks = PERM.stageTasks.manage;
  readonly subtasks = signal<ProjectSubTask[]>([]);
  readonly busy = signal(false);

  doneCount(): number {
    return this.subtasks().filter((s) => s.isDone).length;
  }

  /** Done-percentage for the progress fill width (0–100). */
  subPct(): number {
    const total = this.subtasks().length;
    return total ? Math.round((this.doneCount() / total) * 100) : 0;
  }

  /**
   * crmp P-5: sub-task writes are Editor-level (contract §2.17.2) and need their route claim
   * (create/update/delete: stage_tasks.manage; complete/reopen: manage or complete) AND an open project.
   */
  can(action: ProjectAction): boolean {
    return this.access.can(this.projectId(), action);
  }

  /** The leading box toggles done/reopen; interactive only when the caller may do that. */
  canManage(): boolean {
    return this.can('subtask.complete') || this.can('subtask.reopen');
  }

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.api
      .getByTask(this.projectId(), this.taskId())
      .subscribe((list) => this.subtasks.set(list));
  }

  toggle(sub: ProjectSubTask): void {
    if (this.busy()) return;
    this.busy.set(true);
    const call = sub.isDone
      ? this.api.reopen(this.projectId(), this.taskId(), sub.id)
      : this.api.markDone(this.projectId(), sub.id);
    call.subscribe({
      next: () => {
        this.subtasks.update((list) =>
          list.map((s) => (s.id === sub.id ? { ...s, isDone: !s.isDone } : s)),
        );
        this.busy.set(false);
      },
      error: (err: HttpErrorResponse) => {
        this.busy.set(false);
        // project_sub_tasks.AlreadyDone / NotDone mean local state drifted — reload.
        this.toast.show({ tone: 'danger', message: friendly(this.errors.parse(err)) });
        this.load();
      },
    });
  }

  async openCreate(): Promise<void> {
    const data: SubtaskFormDialogData = {
      mode: 'create',
      projectId: this.projectId(),
      projectTaskId: this.taskId(),
      nextOrder: (this.subtasks().length + 1) * 10,
    };
    const created = await this.modal
      .open<boolean>(SubtaskFormDialogComponent, { size: 'md', data })
      .afterClosed();
    if (created) this.load();
  }

  async openEdit(sub: ProjectSubTask): Promise<void> {
    const data: SubtaskFormDialogData = {
      mode: 'edit',
      projectId: this.projectId(),
      projectTaskId: this.taskId(),
      subtaskId: sub.id,
      initial: { title: sub.title, order: sub.order, isRequired: sub.isRequired },
    };
    const saved = await this.modal
      .open<boolean>(SubtaskFormDialogComponent, { size: 'md', data })
      .afterClosed();
    if (saved) this.load();
  }

  async remove(sub: ProjectSubTask): Promise<void> {
    const ok = await this.confirm.open({
      title: 'Delete subtask',
      body: `Delete "${sub.title}"? This cannot be undone.`,
      confirmLabel: 'Delete',
      tone: 'danger',
    });
    if (!ok) return;
    this.api.remove(this.projectId(), this.taskId(), sub.id).subscribe({
      next: () => this.subtasks.update((list) => list.filter((s) => s.id !== sub.id)),
      error: (err: HttpErrorResponse) =>
        this.toast.show({ tone: 'danger', message: friendly(this.errors.parse(err)) }),
    });
  }
}

import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { ToastService } from '@platform/feedback/toast.service';
import { CatalogService } from '@platform/i18n/catalog.service';
import {
  GateNotRecreatableError,
  GateRemovedError,
  isRecreatable,
} from '../../data/project.service';
import { ProjectAccessStore } from '../../stores/project-access.store';
import type { ProjectAction } from '../../model/project-actions';
import { catchError, of } from 'rxjs';
import { TaskGateConditionService } from '../../data/task-gate-condition.service';
import { StageGateConditionService } from '../../data/stage-gate-condition.service';
import { ProjectTaskService } from '../../data/project-task.service';
import { ProjectStageService } from '../../data/project-stage.service';
import { ErrorHandlerService, friendly } from '@platform/http/error-handler.service';
import { PermissionsService } from '@platform/permissions';
import { ApprovalType, ConditionType, GateCondition } from '../../model/project.model';
import {
  PERA_MODAL_DATA,
  PeraButtonComponent,
  PeraFormFieldComponent,
  PeraInputComponent,
  PeraModalComponent,
  PeraModalFooterDirective,
  PeraModalRef,
  PeraSelectComponent,
  SelectOption,
} from '@ds';

export interface GateConditionModalData {
  /** view = read an existing gate · edit = amend it · new = create one. */
  mode: 'view' | 'edit' | 'new';
  /** Task vs stage selects the endpoint + body shape (api-docs/08). */
  ownerKind: 'task' | 'stage';
  ownerId: string;
  ownerName?: string;
  /** Project scope — feeds the referenced task/stage selects. */
  projectId: string;
  /** Existing gate for view/edit; null for new. */
  gate?: GateCondition | null;
  /** PERM doc-string used to gate Edit / Delete / Mark-resolved inside the modal. */
  managePermission: string;
  /** crmp P1-B: the stage a task gate's task is on (a stage gate's stage is `ownerId`). */
  stageId?: string | null;
}

/** A status segment value — backend only models satisfied/pending (`isSatisfied`). */
type StatusSeg = 'sat' | 'pend';

/**
 * UI type keys → backend `ConditionType`. The design's `<select>` exposes
 * Review and Checklist; both fold to `ManualCheck` (the backend has no distinct
 * value). Stage is offered only for stage-owned gates.
 */
const UI_TYPE_TO_CONDITION: Record<string, ConditionType> = {
  task: 'Task',
  stage: 'Stage',
  attachment: 'Attachment',
  approval: 'Approval',
  review: 'ManualCheck',
  checklist: 'ManualCheck',
};

/**
 * Deliberately PARTIAL. `Budget` and the three CRM gate types have no authoring UI
 * in this dialog — CRM gates are satisfied reactively by CRM domain events, never
 * hand-authored. The call site already falls back (`?? 'review'`).
 */
const CONDITION_TO_UI: Partial<Record<ConditionType, string>> = {
  Task: 'task',
  Stage: 'stage',
  Attachment: 'attachment',
  Approval: 'approval',
  ManualCheck: 'review',
};

/** UPPERCASE-ish badge shown next to the gate label (design `.gkind`). */
const GATE_KIND: Record<ConditionType, string> = {
  Task: 'Task',
  Stage: 'Stage',
  Approval: 'Approval',
  ManualCheck: 'Check',
  Attachment: 'Attachment',
  Budget: 'Budget',
  CrmPeriodClosed: 'Requirement period',
  CrmBriefApproved: 'Brief approved',
  CrmItemsResolved: 'Requirements resolved',
  DocumentApproved: 'Document approved',
};

const APPROVAL_LABEL: Record<ApprovalType, string> = {
  ManagerApproval: 'Manager approval',
  ClientReview: 'Client review',
};

/**
 * Unified gate-condition modal — one floating window covering View, Edit and New
 * per the current `DMS Task Detail` handoff. View shows status / type / detail /
 * applies-to with Delete · Edit · Mark resolved; Edit/New shows label · type ·
 * status · note. Mutations hit the real gate API (task: `project.manage_tasks`,
 * stage: `project.manage_stages`) and the modal closes with `true` on any change
 * so the host refetches (§9.2).
 *
 * Backend honesty: gate status is `isSatisfied` only — there is no reopen /
 * un-satisfy / reject endpoint, so the design's "Blocking" segment and "Reopen"
 * action are dropped (see docs/DMS_TASK_DETAIL_BACKEND_GAPS.md). Update only
 * persists the label; `conditionType` is immutable after create.
 */
@Component({
  selector: 'app-gate-condition-modal',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    PeraModalComponent,
    PeraModalFooterDirective,
    PeraFormFieldComponent,
    PeraInputComponent,
    PeraSelectComponent,
    PeraButtonComponent,
  ],
  template: `
    <pera-modal [title]="title()" size="md">
      <div class="flex flex-col gap-3">
        <p class="m-0 fs-label text-text-muted">{{ subtitle() }}</p>

        @if (mode() === 'view' && data.gate; as g) {
          <!-- ===== VIEW ===== -->
          <div
            class="flex items-center gap-3 px-3 py-3 border"
            [class.border-success]="isSatisfied()"
            [class.bg-success-soft]="isSatisfied()"
            [class.border-pending]="!isSatisfied()"
            [class.border-dashed]="!isSatisfied()"
          >
            <span
              class="w-icon-lg h-icon-lg flex items-center justify-center flex-shrink-0 border"
              [class.border-success]="isSatisfied()"
              [class.text-success]="isSatisfied()"
              [class.bg-bg]="isSatisfied()"
              [class.border-pending]="!isSatisfied()"
              [class.text-pending]="!isSatisfied()"
              [class.border-dashed]="!isSatisfied()"
            >
              @if (isSatisfied()) {
                <svg
                  width="15"
                  height="15"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2.2"
                >
                  <path d="M5 12l4 4L19 6" />
                </svg>
              } @else {
                <svg
                  width="15"
                  height="15"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.7"
                >
                  <circle cx="12" cy="12" r="9" />
                  <path d="M12 7v5l3 2" />
                </svg>
              }
            </span>
            <div class="min-w-0">
              <div class="fs-body-sm font-medium truncate">{{ g.label || g.conditionType }}</div>
              <div class="fs-label text-text-muted">{{ statusLabel() }}</div>
            </div>
          </div>

          <div class="grid grid-cols-[var(--w-column-sm)_1fr] gap-x-3 gap-y-2 fs-caption pt-1">
            <span class="text-text-muted">Type</span>
            <span
              ><span
                class="fs-micro font-semibold tracking-[0.04em] uppercase text-text-muted border border-border px-1.5 py-px"
                >{{ kind() }}</span
              ></span
            >
            <span class="text-text-muted">Detail</span>
            <span class="text-text-secondary">{{ detail() }}</span>
            <span class="text-text-muted">Applies to</span>
            <span class="text-text-secondary truncate">{{ data.ownerName || data.ownerId }}</span>
          </div>
        } @else {
          <!-- ===== EDIT / NEW ===== -->
          <pera-form-field label="Condition" [required]="true">
            <pera-input
              [ngModel]="label()"
              (ngModelChange)="label.set($event)"
              placeholder="e.g. Manager approval"
            />
          </pera-form-field>

          <pera-form-field label="Type" [required]="true" [hint]="typeHint()">
            <pera-select
              [options]="typeOptions()"
              [ngModel]="uiType()"
              (ngModelChange)="uiType.set($event)"
              [disabled]="mode() === 'edit'"
            />
          </pera-form-field>

          @if (uiType() === 'task') {
            <pera-form-field
              label="Referenced task"
              [required]="true"
              hint="Must be completed before this gate is satisfied."
            >
              <pera-select
                [options]="taskOptions()"
                [ngModel]="referencedTaskId()"
                (ngModelChange)="referencedTaskId.set($event)"
                [disabled]="mode() === 'edit'"
                placeholder="Select a task"
              />
            </pera-form-field>
          }
          @if (uiType() === 'stage') {
            <pera-form-field
              label="Referenced stage"
              [required]="true"
              hint="Must be completed before this gate is satisfied."
            >
              <pera-select
                [options]="stageOptions()"
                [ngModel]="referencedStageId()"
                (ngModelChange)="referencedStageId.set($event)"
                [disabled]="mode() === 'edit'"
                placeholder="Select a stage"
              />
            </pera-form-field>
          }
          @if (uiType() === 'approval') {
            <pera-form-field label="Approval type" [required]="true">
              <pera-select
                [options]="approvalOptions"
                [ngModel]="approvalType()"
                (ngModelChange)="approvalType.set($event)"
                [disabled]="mode() === 'edit'"
              />
            </pera-form-field>
          }

          <pera-form-field label="Status">
            <div class="inline-flex border border-border" role="group" aria-label="Gate status">
              <button
                type="button"
                class="px-3 py-1.5 fs-caption font-medium cursor-pointer transition-colors"
                [class.bg-text-primary]="status() === 'sat'"
                [class.text-bg]="status() === 'sat'"
                [class.text-text-secondary]="status() !== 'sat'"
                (click)="status.set('sat')"
              >
                Satisfied
              </button>
              <button
                type="button"
                class="px-3 py-1.5 fs-caption font-medium cursor-pointer transition-colors border-s border-border"
                [class.bg-text-primary]="status() === 'pend'"
                [class.text-bg]="status() === 'pend'"
                [class.text-text-secondary]="status() !== 'pend'"
                (click)="status.set('pend')"
              >
                Pending
              </button>
            </div>
          </pera-form-field>

          @if (status() === 'sat') {
            <pera-form-field
              label="Resolution note"
              hint="Recorded when the gate is marked satisfied."
            >
              <pera-input
                [ngModel]="note()"
                (ngModelChange)="note.set($event)"
                placeholder="Short status note"
              />
            </pera-form-field>
          }

          @if (errorMessage()) {
            <p class="m-0 fs-caption text-danger">{{ errorMessage() }}</p>
          }
        }
      </div>

      <div peraModalFooter class="flex items-center justify-between w-full gap-2">
        @if (mode() === 'view') {
          @if (canDelete()) {
            <button
              type="button"
              class="fs-label text-danger hover:underline cursor-pointer disabled:opacity-50"
              [disabled]="busy()"
              (click)="remove()"
              data-delete-gate
            >
              Delete gate
            </button>
          } @else {
            <span></span>
          }
          <div class="flex gap-2">
            @if (canEdit() || canSatisfy()) {
              @if (canEdit()) {
                <pera-button variant="secondary" [disabled]="busy()" (click)="requestEditForm()"
                  >Edit</pera-button
                >
              }
              @if (canSatisfy()) {
                <pera-button
                  variant="primary"
                  [loading]="busy()"
                  (click)="markResolved()"
                  data-satisfy
                  >Mark resolved</pera-button
                >
              }
            } @else {
              <span></span>
            }
          </div>
        } @else {
          <span class="fs-label text-text-muted">{{
            mode() === 'new'
              ? 'Will be added to this ' + data.ownerKind
              : 'Updates apply immediately'
          }}</span>
          <div class="flex gap-2">
            <pera-button variant="ghost" [disabled]="busy()" (click)="cancelEdit()"
              >Cancel</pera-button
            >
            <pera-button variant="primary" [disabled]="!valid()" [loading]="busy()" (click)="save()"
              >Save</pera-button
            >
          </div>
        }
      </div>
    </pera-modal>
  `,
})
export class GateConditionModalComponent {
  private readonly taskGates = inject(TaskGateConditionService);
  private readonly stageGates = inject(StageGateConditionService);
  private readonly tasksApi = inject(ProjectTaskService);
  private readonly stagesApi = inject(ProjectStageService);
  private readonly errors = inject(ErrorHandlerService);
  private readonly perms = inject(PermissionsService);
  private readonly modalRef = inject(PeraModalRef) as PeraModalRef<boolean | 'edit'>;
  readonly data = inject(PERA_MODAL_DATA) as GateConditionModalData;

  readonly mode = signal<'view' | 'edit' | 'new'>('new');
  readonly busy = signal(false);
  readonly errorMessage = signal('');

  /** Whichever gate the modal currently reflects (re-read after a save). */
  readonly canManage = computed(() => this.perms.can(this.data.managePermission));
  private readonly access = inject(ProjectAccessStore);
  private gateCan(op: 'create' | 'delete' | 'satisfy'): boolean {
    const action =
      `${this.data.ownerKind === 'task' ? 'taskGate' : 'stageGate'}.${op}` as ProjectAction;
    const stageId = this.data.ownerKind === 'stage' ? this.data.ownerId : this.data.stageId;
    return this.access.can(this.data.projectId, action, stageId);
  }

  /**
   * crmp P-8: only a pending manual-check gate can be satisfied by hand
   * (`gate_conditions.NotManuallySatisfiable`, contract §5.6); a satisfied gate, or an Approval gate
   * still waiting for its decision, cannot be deleted (`gate_conditions.NotDeletable`). Each also
   * needs its gates claim AND the Manager level (contract §2.17.2).
   */
  readonly canSatisfy = computed(() => {
    const g = this.data.gate;
    return (
      !!g && g.conditionType === 'ManualCheck' && g.status === 'Pending' && this.gateCan('satisfy')
    );
  });
  readonly deletable = computed(() => {
    const g = this.data.gate;
    if (!g) return false;
    return g.status !== 'Satisfied' && !(g.conditionType === 'Approval' && g.status === 'Pending');
  });
  readonly canDelete = computed(() => this.deletable() && this.gateCan('delete'));
  /** An edit deletes and re-creates (no update route), so it needs both, and a re-creatable gate. */
  readonly canEdit = computed(() => {
    const g = this.data.gate;
    return (
      !!g &&
      this.canDelete() &&
      this.gateCan('create') &&
      isRecreatable({ ...g, approvalType: g.approvalType })
    );
  });

  // ---- view-mode derivations ----
  readonly isSatisfied = computed(() => this.data.gate?.isSatisfied ?? false);
  readonly kind = computed(() => {
    const ct = this.data.gate?.conditionType;
    return ct ? (GATE_KIND[ct] ?? ct) : '';
  });
  readonly statusLabel = computed(() => {
    const g = this.data.gate;
    if (!g) return '';
    if (g.isSatisfied) {
      const when = g.satisfiedAt ? this.formatDate(g.satisfiedAt) : null;
      return when ? `Satisfied · ${when}` : 'Satisfied';
    }
    return `Pending on ${g.trigger === 'Unlock' ? 'unlock' : 'complete'}`;
  });
  readonly detail = computed(() => {
    const g = this.data.gate;
    if (!g) return '—';
    if (g.isSatisfied && g.satisfiedNote) return g.satisfiedNote;
    if (g.conditionType === 'Approval' && g.approvalType) return APPROVAL_LABEL[g.approvalType];
    return this.statusLabel();
  });

  readonly typeHint = computed(() =>
    this.mode() === 'edit' ? 'Type is fixed once the gate is created.' : '',
  );
  readonly title = computed(() =>
    this.mode() === 'new'
      ? 'Add gate condition'
      : this.mode() === 'edit'
        ? 'Edit gate condition'
        : 'Gate condition',
  );
  readonly subtitle = computed(() => {
    if (this.mode() === 'new') return `New condition to complete this ${this.data.ownerKind}`;
    return `${this.data.ownerName || this.data.ownerId} · gate condition`;
  });

  // ---- edit / new form state ----
  readonly label = signal('');
  readonly uiType = signal<string>('approval');
  readonly status = signal<StatusSeg>('pend');
  readonly note = signal('');
  readonly referencedTaskId = signal<string | null>(null);
  readonly referencedStageId = signal<string | null>(null);
  readonly approvalType = signal<ApprovalType>('ManagerApproval');

  readonly approvalOptions: SelectOption[] = [
    { value: 'ManagerApproval', label: 'Manager approval' },
    { value: 'ClientReview', label: 'Client review' },
  ];
  readonly typeOptions = computed<SelectOption[]>(() => {
    const base: SelectOption[] = [
      { value: 'task', label: 'Task' },
      { value: 'attachment', label: 'Attachment' },
      { value: 'approval', label: 'Approval' },
      { value: 'review', label: 'Review' },
      { value: 'checklist', label: 'Checklist' },
    ];
    if (this.data.ownerKind === 'stage') base.splice(1, 0, { value: 'stage', label: 'Stage' });
    return base;
  });
  readonly taskOptions = signal<SelectOption[]>([]);
  readonly stageOptions = signal<SelectOption[]>([]);

  readonly valid = computed(() => {
    if (!this.label().trim()) return false;
    if (this.uiType() === 'task' && this.mode() === 'new' && !this.referencedTaskId()) return false;
    if (this.uiType() === 'stage' && this.mode() === 'new' && !this.referencedStageId())
      return false;
    return true;
  });

  constructor() {
    this.mode.set(this.data.mode);
    if (this.data.mode !== 'view' && this.data.gate) this.seedFromGate(this.data.gate);

    // Reference choices (same project; owner excluded — backend rejects self-ref).
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

  private seedFromGate(g: GateCondition): void {
    this.label.set(g.label);
    this.uiType.set(CONDITION_TO_UI[g.conditionType] ?? 'review');
    this.status.set(g.isSatisfied ? 'sat' : 'pend');
    this.note.set(g.satisfiedNote ?? '');
    this.referencedTaskId.set(g.referencedTaskId);
    this.referencedStageId.set(g.referencedStageId);
    if (g.approvalType) this.approvalType.set(g.approvalType);
  }

  enterEdit(): void {
    if (this.data.gate) this.seedFromGate(this.data.gate);
    this.mode.set('edit');
  }

  /** View "Edit" now hands off to the DMS Forms template dialog (the panel reopens it). */
  requestEditForm(): void {
    this.modalRef.close('edit');
  }

  cancelEdit(): void {
    // From a fresh "new" there is nothing to fall back to → close.
    if (this.data.gate) this.mode.set('view');
    else this.close(false);
  }

  private readonly toast = inject(ToastService);
  private readonly catalog = inject(CatalogService);

  close(changed: boolean): void {
    this.modalRef.close(changed);
  }

  // ---- mutations ----
  markResolved(): void {
    const g = this.data.gate;
    if (!g || this.busy()) return;
    this.busy.set(true);
    this.gateApi('satisfy', g.id, { note: this.note().trim() || null }).subscribe({
      next: () => this.close(true),
      error: (err: HttpErrorResponse) => this.fail(err),
    });
  }

  remove(): void {
    const g = this.data.gate;
    if (!g || this.busy()) return;
    this.busy.set(true);
    this.gateApi('remove', g.id).subscribe({
      next: () => this.close(true),
      error: (err: HttpErrorResponse) => this.fail(err),
    });
  }

  save(): void {
    if (!this.valid() || this.busy()) return;
    this.busy.set(true);
    this.errorMessage.set('');
    this.mode() === 'new' ? this.createGate() : this.updateGate();
  }

  private createGate(): void {
    const conditionType = UI_TYPE_TO_CONDITION[this.uiType()];
    const req = {
      conditionType,
      trigger: 'Complete' as const,
      label: this.label().trim(),
      referencedTaskId: conditionType === 'Task' ? this.referencedTaskId() : null,
      referencedStageId: conditionType === 'Stage' ? this.referencedStageId() : null,
      approvalType: conditionType === 'Approval' ? this.approvalType() : null,
    };
    const svc = this.data.ownerKind === 'task' ? this.taskGates : this.stageGates;
    const call = svc.create(this.data.projectId, this.data.ownerId, req);
    call.subscribe({
      next: (newId) => {
        // If the author pre-marked it satisfied, chain a satisfy on the new gate.
        // P-8: only a manual check can be satisfied by hand (NotManuallySatisfiable otherwise).
        if (this.status() === 'sat' && newId && conditionType === 'ManualCheck') {
          this.gateApi('satisfy', newId, { note: this.note().trim() || null }).subscribe({
            next: () => this.close(true),
            error: (err: HttpErrorResponse) => this.fail(err),
          });
        } else {
          this.close(true);
        }
      },
      error: (err: HttpErrorResponse) => this.fail(err),
    });
  }

  private updateGate(): void {
    const g = this.data.gate;
    if (!g) return;
    const wantsSatisfy = this.status() === 'sat' && !g.isSatisfied;
    const satisfy = (id: string) =>
      this.gateApi('satisfy', id, { note: this.note().trim() || null });
    // crmp A-2: no update route. Only a changed label needs the delete + re-create; a bare satisfy
    // keeps the gate (gap table REMOVED P-73/100).
    if (this.label().trim() === g.label) {
      if (!wantsSatisfy) {
        this.close(true);
        return;
      }
      satisfy(g.id).subscribe({
        next: () => this.close(true),
        error: (err: HttpErrorResponse) => this.fail(err),
      });
      return;
    }
    const svc = this.data.ownerKind === 'task' ? this.taskGates : this.stageGates;
    svc
      .recreate(this.data.projectId, this.data.ownerId, g.id, {
        conditionType: g.conditionType,
        trigger: g.trigger,
        label: this.label().trim(),
        referencedTaskId: g.referencedTaskId,
        referencedStageId: g.referencedStageId,
        referencedDocumentId: g.referencedDocumentId,
        approvalType: g.approvalType,
      })
      .subscribe({
        next: (newId) => {
          if (wantsSatisfy && newId) {
            satisfy(newId).subscribe({
              next: () => this.close(true),
              error: (err: HttpErrorResponse) => this.fail(err),
            });
          } else {
            this.close(true);
          }
        },
        error: (err: HttpErrorResponse) => this.fail(err),
      });
  }

  /** Dispatch a gate call to the task or stage service by owner kind. */
  private gateApi(op: 'satisfy' | 'remove', id: string, body?: unknown) {
    const svc = this.data.ownerKind === 'task' ? this.taskGates : this.stageGates;
    if (op === 'satisfy')
      return svc.satisfy(this.data.projectId, id, (body as { note?: string | null }) ?? {});
    return svc.remove(this.data.projectId, id);
  }

  private fail(err: unknown): void {
    this.busy.set(false);
    if (err instanceof GateNotRecreatableError) {
      this.errorMessage.set(this.catalog.t('gates.notRecreatable'));
      return;
    }
    if (err instanceof GateRemovedError) {
      // R1-F4: the delete went through and the re-create did not — the old gate is gone.
      const reason =
        err.cause instanceof HttpErrorResponse ? friendly(this.errors.parse(err.cause)) : '';
      this.toast.show({
        tone: 'danger',
        message: this.catalog.t('gates.removedNotRecreated', { reason }),
      });
      this.close(true);
      return;
    }
    this.errorMessage.set(
      err instanceof HttpErrorResponse ? friendly(this.errors.parse(err)) : String(err),
    );
  }

  private formatDate(iso: string): string {
    const d = new Date(iso);
    return Number.isNaN(d.getTime())
      ? iso
      : d.toLocaleDateString('en-US', { month: 'short', day: '2-digit' });
  }
}

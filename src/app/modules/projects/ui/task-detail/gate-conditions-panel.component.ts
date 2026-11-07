import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { TaskGateConditionService } from '../../data/task-gate-condition.service';
import { StageGateConditionService } from '../../data/stage-gate-condition.service';
import { PERM } from '@platform/permissions';
import { ApprovalType, ConditionType, GateCondition } from '../../model/project.model';
import { ModalService } from '@ds';
import {
  GateConditionModalComponent,
  GateConditionModalData,
} from './gate-condition-modal.component';
import {
  GateConditionFormDialogComponent,
  GateConditionFormDialogData,
} from './gate-condition-form-dialog.component';

/** UPPERCASE tag shown next to the gate label (design `.gkind`). */
const GATE_KIND: Record<ConditionType, string> = {
  Task: 'Task',
  Stage: 'Stage',
  Approval: 'Approval',
  ManualCheck: 'Check',
  Attachment: 'Attachment',
  // Feature 004. Office chrome — an English label is acceptable here (FR-037b).
  // Without these the strip shows raw enum names via its `?? gate.conditionType`
  // fallback (T098).
  Budget: 'Budget',
  CrmPeriodClosed: 'Requirement period',
  CrmBriefApproved: 'Brief approved',
  CrmItemsResolved: 'Requirements resolved',
};

const APPROVAL_LABEL: Record<ApprovalType, string> = {
  ManagerApproval: 'Manager approval',
  ClientReview: 'Client review',
};

/**
 * Gate conditions panel — works for tasks (`/api/task-gate-conditions`,
 * Projects.ManageTasks) and stages (`/api/stage-gate-conditions`,
 * Projects.ManageStages) per api-docs/08. Each row is a clickable gate card that
 * opens the unified `GateConditionModalComponent` in View mode (status / type /
 * detail + Delete · Edit · Mark resolved). `+ Add gate` opens it in New mode.
 * After any mutation the list reloads and `changed` fires so the host can refetch
 * the owner (a satisfied gate can flip `canComplete`, §9.2).
 */
@Component({
  selector: 'app-gate-conditions-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @for (gate of gates(); track gate.id) {
      <div
        role="button"
        tabindex="0"
        class="flex gap-3 px-4 py-3 border-b border-border-soft last:border-b-0 cursor-pointer transition-colors hover:bg-surface-muted focus:outline-none focus-visible:bg-surface-muted"
        [attr.aria-label]="'Open gate ' + (gate.label || gate.conditionType)"
        (click)="openView(gate)"
        (keydown.enter)="openView(gate)"
        (keydown.space)="$event.preventDefault(); openView(gate)"
      >
        @if (gate.isSatisfied) {
          <span
            class="w-icon-sm h-icon-sm flex items-center justify-center flex-shrink-0 border border-success bg-success-soft text-success"
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
          </span>
        } @else {
          <span
            class="w-icon-sm h-icon-sm flex items-center justify-center flex-shrink-0 border border-dashed border-pending text-pending"
          >
            <svg
              width="11"
              height="11"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.8"
            >
              <circle cx="12" cy="12" r="9" />
              <path d="M12 7v5l3 2" />
            </svg>
          </span>
        }

        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2 mb-0.5">
            <span class="fs-caption font-medium truncate">{{
              gate.label || gate.conditionType
            }}</span>
            <span
              class="fs-micro font-semibold tracking-[0.04em] uppercase text-text-muted border border-border px-1.5 py-px shrink-0"
              >{{ kind(gate) }}</span
            >
          </div>
          <div class="fs-label text-text-muted">{{ meta(gate) }}</div>
        </div>
        <span class="self-center text-text-muted shrink-0">
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.7"
            aria-hidden="true"
          >
            <path d="M9 6l6 6-6 6" />
          </svg>
        </span>
      </div>
    } @empty {
      <p class="m-0 px-4 py-3 fs-caption text-text-muted">
        No gates yet. Gates control when this {{ ownerKind() }} can start or complete.
      </p>
    }
  `,
})
export class GateConditionsPanelComponent implements OnInit {
  readonly ownerKind = input<'task' | 'stage'>('task');
  readonly ownerId = input.required<string>();
  readonly ownerName = input<string>('');
  readonly projectId = input.required<string>();
  /** Fires after any gate mutation so the host can refetch the owner (§9.2). */
  readonly changed = output<void>();

  private readonly taskGates = inject(TaskGateConditionService);
  private readonly stageGates = inject(StageGateConditionService);
  private readonly modal = inject(ModalService);

  readonly gates = signal<GateCondition[]>([]);

  /** Task gates: Projects.ManageTasks · Stage gates: Projects.ManageStages (api-docs/08). */
  readonly managePermission = computed(() =>
    this.ownerKind() === 'task' ? PERM.stageTasks.manage : PERM.stages.manage,
  );

  satisfiedCount(): number {
    return this.gates().filter((g) => g.isSatisfied).length;
  }

  kind(gate: GateCondition): string {
    return GATE_KIND[gate.conditionType] ?? gate.conditionType;
  }

  /** Design `.gmeta`: "Satisfied · …" once met, otherwise "Pending on {trigger} · {target}". */
  meta(gate: GateCondition): string {
    if (gate.isSatisfied) {
      const when = gate.satisfiedAt ? this.formatDate(gate.satisfiedAt) : null;
      return when ? `Satisfied · ${when}` : 'Satisfied';
    }
    const phase = gate.trigger === 'Unlock' ? 'unlock' : 'complete';
    const target =
      gate.conditionType === 'Approval' && gate.approvalType
        ? APPROVAL_LABEL[gate.approvalType]
        : null;
    return target ? `Pending on ${phase} · ${target}` : `Pending on ${phase}`;
  }

  private formatDate(iso: string): string {
    const d = new Date(iso);
    return Number.isNaN(d.getTime())
      ? iso
      : d.toLocaleDateString('en-US', { month: 'short', day: '2-digit' });
  }

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    const call =
      this.ownerKind() === 'task'
        ? this.taskGates.getByTask(this.projectId(), this.ownerId())
        : this.stageGates.getByStage(this.projectId(), this.ownerId());
    call.subscribe((list) => this.gates.set(list));
  }

  /** Read view (status / satisfy / delete). Its "Edit" resolves `'edit'`, which routes to the template form. */
  async openView(gate: GateCondition): Promise<void> {
    const data: GateConditionModalData = {
      mode: 'view',
      gate,
      ownerKind: this.ownerKind(),
      ownerId: this.ownerId(),
      ownerName: this.ownerName(),
      projectId: this.projectId(),
      managePermission: this.managePermission(),
    };
    const result = await this.modal
      .open<boolean | 'edit'>(GateConditionModalComponent, { size: 'md', data })
      .afterClosed();
    if (result === 'edit') {
      await this.openEdit(gate);
    } else if (result) {
      this.reload();
    }
  }

  /** Create — the DMS Forms template gate dialog. */
  openNew(): Promise<void> {
    return this.openForm({ mode: 'create' });
  }

  /** Edit — same template dialog, seeded from the gate (label + trigger mutable). */
  openEdit(gate: GateCondition): Promise<void> {
    return this.openForm({
      mode: 'edit',
      gateId: gate.id,
      initial: {
        conditionType: gate.conditionType,
        trigger: gate.trigger,
        label: gate.label,
        approvalType: gate.approvalType,
        referencedTaskId: gate.referencedTaskId,
        referencedStageId: gate.referencedStageId,
      },
    });
  }

  private async openForm(
    partial: Pick<GateConditionFormDialogData, 'mode' | 'gateId' | 'initial'>,
  ): Promise<void> {
    const data: GateConditionFormDialogData = {
      ownerKind: this.ownerKind(),
      ownerId: this.ownerId(),
      projectId: this.projectId(),
      ...partial,
    };
    const changed = await this.modal
      .open<boolean>(GateConditionFormDialogComponent, { size: 'lg', data })
      .afterClosed();
    if (changed) this.reload();
  }

  private reload(): void {
    this.load();
    this.changed.emit();
  }
}

import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { catchError, of } from 'rxjs';
import { ProjectAccessStore } from '../../../stores/project-access.store';
import { StageGateConditionService } from '../../../data/stage-gate-condition.service';
import { LocaleService } from '@platform/i18n';
import { ApprovalType, ConditionType, GateCondition } from '../../../model/project.model';
import { PermissionsService } from '@platform/permissions';
import { PERM } from '@platform/permissions';
import { formatShortDate } from '@shared/ui/status';
import {
  ModalService,
  PERA_MODAL_DATA,
  PeraButtonComponent,
  PeraModalComponent,
  PeraModalFooterDirective,
  PeraModalRef,
} from '@ds';
import {
  GateConditionModalComponent,
  GateConditionModalData,
} from '../../task-detail/gate-condition-modal.component';

const GATE_KIND: Record<ConditionType, string> = {
  Task: 'Tasks',
  Stage: 'Sequence',
  Approval: 'Approval',
  ManualCheck: 'Manual',
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

export interface StageGatesModalData {
  stageId: string;
  stageName: string;
  projectId: string;
  /** Stage is blocked from submitting (rejected / pending tasks remain). */
  blocked: boolean;
  rejCount: number;
  pendCount: number;
}

/**
 * Gate-to-advance floating window — the stage's gate checklist lifted into a
 * modal (mirroring how a task's gate opens in a floating window). Leads with the
 * derived, read-only "All tasks resolved" gate then lists the real stage gates;
 * each row taps through to the shared `GateConditionModalComponent` (View +
 * satisfy / edit / delete), and "Add gate" opens it in New mode — both stack on
 * top of this window. Self-contained Tailwind styling because the CDK overlay
 * renders outside the page's scoped `.dms-stage` rules. Closes with `true` if any
 * gate changed so the host refetches (a flip can change submit-ability).
 */
@Component({
  selector: 'app-stage-gates-modal',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PeraModalComponent, PeraModalFooterDirective, PeraButtonComponent],
  template: `
    <pera-modal title="Gate to advance" size="md">
      <div class="flex flex-col">
        <p class="m-0 px-1 pb-2 fs-label text-text-muted">
          {{ satisfied() }} of {{ total() }} satisfied · {{ data.stageName }}
        </p>

        <!-- derived, read-only "all tasks resolved" gate -->
        <div class="flex gap-3 px-1 py-3 border-b border-border-soft">
          @if (data.blocked) {
            <span
              class="w-5 h-5 flex items-center justify-center shrink-0 border border-danger text-danger bg-danger-soft"
            >
              <svg
                width="11"
                height="11"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
              >
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </span>
          } @else {
            <span
              class="w-5 h-5 flex items-center justify-center shrink-0 border border-success text-success bg-success-soft"
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
          }
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2 mb-0.5">
              <span class="fs-caption font-medium">All tasks resolved</span>
              <span
                class="fs-micro font-semibold tracking-[0.04em] uppercase text-text-muted border border-border px-1.5 py-px shrink-0"
                >Tasks</span
              >
            </div>
            <div
              class="fs-label"
              [class.text-danger]="data.blocked"
              [class.text-text-muted]="!data.blocked"
            >
              {{
                data.blocked
                  ? data.rejCount + ' rejected · ' + data.pendCount + ' pending — blocks submit'
                  : 'Every task reached Completed'
              }}
            </div>
          </div>
        </div>

        <!-- real stage gate conditions (tappable) -->
        @for (g of gates(); track g.id) {
          <div
            role="button"
            tabindex="0"
            class="flex gap-3 px-1 py-3 border-b border-border-soft last:border-b-0 cursor-pointer transition-colors hover:bg-surface-muted focus:outline-none focus-visible:bg-surface-muted"
            [attr.aria-label]="'Open gate ' + (g.label || g.conditionType)"
            (click)="openView(g)"
            (keydown.enter)="openView(g)"
            (keydown.space)="$event.preventDefault(); openView(g)"
          >
            @if (g.isSatisfied) {
              <span
                class="w-5 h-5 flex items-center justify-center shrink-0 border border-success bg-success-soft text-success"
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
                class="w-5 h-5 flex items-center justify-center shrink-0 border border-dashed border-pending text-pending"
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
                  g.label || g.conditionType
                }}</span>
                <span
                  class="fs-micro font-semibold tracking-[0.04em] uppercase text-text-muted border border-border px-1.5 py-px shrink-0"
                  >{{ kind(g) }}</span
                >
              </div>
              <div class="fs-label text-text-muted">{{ meta(g) }}</div>
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
          <p class="m-0 px-1 py-3 fs-caption text-text-muted">
            No gate conditions yet. Gates control when this stage can advance.
          </p>
        }
      </div>

      <div peraModalFooter class="flex items-center justify-between w-full gap-2">
        @if (canManage()) {
          <pera-button
            variant="secondary"
            iconStart="plus"
            [disabled]="loading()"
            (click)="openNew()"
            >Add gate</pera-button
          >
        } @else {
          <span></span>
        }
        <pera-button variant="ghost" (click)="close()">Done</pera-button>
      </div>
    </pera-modal>
  `,
})
export class StageGatesModalComponent {
  readonly ref = inject(PeraModalRef) as PeraModalRef<boolean>;
  readonly data = inject(PERA_MODAL_DATA) as StageGatesModalData;
  private readonly stageGates = inject(StageGateConditionService);
  private readonly modal = inject(ModalService);
  private readonly perms = inject(PermissionsService);
  private readonly locale = inject(LocaleService);

  readonly gates = signal<GateCondition[]>([]);
  readonly loading = signal(true);
  private changed = false;

  private readonly access = inject(ProjectAccessStore);
  /** crmp P-8: adding a stage gate needs stages.manage_gates AND the Manager level (GateEndpoints.cs:32). */
  readonly canManage = computed(() =>
    this.access.can(this.data.projectId, 'stageGate.create', this.data.stageId),
  );
  readonly satisfied = computed(
    () => (this.data.blocked ? 0 : 1) + this.gates().filter((g) => g.isSatisfied).length,
  );
  readonly total = computed(() => this.gates().length + 1);

  constructor() {
    this.load();
  }

  private load(): void {
    this.stageGates
      .getByStage(this.data.projectId, this.data.stageId)
      .pipe(catchError(() => of([] as GateCondition[])))
      .subscribe((list) => {
        this.gates.set(list);
        this.loading.set(false);
      });
  }

  openNew(): Promise<void> {
    return this.openGate({ mode: 'new', gate: null });
  }

  openView(gate: GateCondition): Promise<void> {
    return this.openGate({ mode: 'view', gate });
  }

  private async openGate(partial: Pick<GateConditionModalData, 'mode' | 'gate'>): Promise<void> {
    const data: GateConditionModalData = {
      ownerKind: 'stage',
      ownerId: this.data.stageId,
      ownerName: this.data.stageName,
      projectId: this.data.projectId,
      // UI-1: stage gate routes need stages.manage_gates.
      managePermission: PERM.stages.manageGates,
      ...partial,
    };
    const dirty = await this.modal
      .open<boolean>(GateConditionModalComponent, { size: 'md', data })
      .afterClosed();
    if (dirty) {
      this.changed = true;
      this.load();
    }
  }

  close(): void {
    this.ref.close(this.changed);
  }

  protected kind(g: GateCondition): string {
    return GATE_KIND[g.conditionType] ?? g.conditionType;
  }

  protected meta(g: GateCondition): string {
    if (g.isSatisfied) {
      return g.satisfiedAt
        ? `Satisfied · ${formatShortDate(g.satisfiedAt, this.locale.locale())}`
        : 'Satisfied';
    }
    if (g.conditionType === 'Approval' && g.approvalType) {
      return `Pending · ${APPROVAL_LABEL[g.approvalType]}`;
    }
    return g.trigger === 'Complete'
      ? 'Required to complete this stage'
      : 'Required to unlock the next stage';
  }
}

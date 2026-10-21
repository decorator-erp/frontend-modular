import { ChangeDetectionStrategy, Component, input } from '@angular/core';

export type ApprovalStepStatus = 'pending' | 'review' | 'approved' | 'rejected';

export interface ApprovalStep {
  label: string;
  status: ApprovalStepStatus;
  approver?: string | null;
}

const DOT_CLASS: Record<ApprovalStepStatus, string> = {
  pending: 'bg-surface border border-text-muted',
  review: 'bg-info',
  approved: 'bg-success',
  rejected: 'bg-error',
};

/**
 * Ordered approval sequence — a horizontal chain of round status dots joined by
 * hairline connectors, each with a label and optional approver. Decorative
 * connectors; status carried by dot fill + label, not colour alone.
 */
@Component({
  selector: 'pera-approval-chain',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <ol class="flex items-stretch m-0 p-0 list-none overflow-x-auto">
      @for (step of steps(); track $index; let first = $first; let last = $last) {
        <li
          class="relative flex-1 min-w-[var(--w-column)] flex flex-col items-center text-center px-2"
        >
          @if (!first) {
            <span class="absolute top-2 start-0 w-1/2 h-px bg-border" aria-hidden="true"></span>
          }
          @if (!last) {
            <span class="absolute top-2 start-1/2 w-1/2 h-px bg-border" aria-hidden="true"></span>
          }
          <span
            class="relative z-[1] w-icon-xs h-icon-xs rounded-full bg-bg flex items-center justify-center"
          >
            <span class="w-2 h-2 rounded-full" [class]="dotClass(step.status)"></span>
          </span>
          <span class="mt-1.5 fs-label font-medium text-text-primary truncate max-w-full">{{
            step.label
          }}</span>
          <span class="font-mono fs-micro text-text-muted">{{ step.status }}</span>
          @if (step.approver) {
            <span class="fs-label text-text-secondary truncate max-w-full">{{
              step.approver
            }}</span>
          }
        </li>
      }
    </ol>
  `,
})
export class PeraApprovalChainComponent {
  readonly steps = input<ApprovalStep[]>([]);

  protected dotClass(status: ApprovalStepStatus): string {
    return DOT_CLASS[status];
  }
}

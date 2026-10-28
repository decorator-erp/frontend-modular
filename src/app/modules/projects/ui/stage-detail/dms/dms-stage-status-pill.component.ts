import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/** Tone per `StageStatus`, plus the task statuses the tasks panel reuses this pill for. */
const STATUS_TONE: Record<string, string> = {
  Active: 'bg-info-soft border-info text-info',
  InProgress: 'bg-info-soft border-info text-info',
  Completed: 'bg-success-soft border-success text-success',
  Rejected: 'bg-danger-soft border-danger text-danger',
  Cancelled: 'bg-danger-soft border-danger text-danger',
  PendingApproval: 'bg-pending-soft border-pending text-pending',
  Locked: 'bg-surface-muted border-border text-text-secondary',
};

const DOT_TONE: Record<string, string> = {
  Active: 'bg-info',
  InProgress: 'bg-info',
  Completed: 'bg-success',
  Rejected: 'bg-danger',
  Cancelled: 'bg-danger',
  PendingApproval: 'bg-pending',
  Locked: 'bg-text-secondary',
};

const OPEN_TONE = 'bg-surface-muted border-border-strong text-text-secondary';

/** Public so callers (e.g. the dependencies rows) can label a status without the pill. */
export const STAGE_STATUS_LABEL: Record<string, string> = {
  Active: 'In progress',
  Completed: 'Completed',
  Rejected: 'Sent back',
  Locked: 'Locked',
};

/**
 * Stage status pill — the design's `.dms-st--*` chip for the backend
 * `StageStatus` enum (Locked · Active · Completed · Rejected). `Active` reads
 * "In progress" and `Rejected` reads "Sent back" to match the DMS wording.
 *
 * **Batch 4b**: this component used to have zero styles of its own and rendered
 * bare `.dms-st` classes that the parent page defined under
 * `ViewEncapsulation.None`. It now owns its own appearance, so removing the
 * parent's CSS no longer breaks it. Meaning is carried by the label plus the dot,
 * never by colour alone (FR-014).
 */
@Component({
  selector: 'app-dms-stage-status-pill',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'inline-flex' },
  template: `
    <span
      class="inline-flex items-center gap-1.5 border font-medium whitespace-nowrap leading-tight {{
        toneClass()
      }} {{ sizeClass() }}"
    >
      <span class="w-1.5 h-1.5 rounded-full shrink-0 {{ dotClass() }}" aria-hidden="true"></span>
      {{ label() }}
    </span>
  `,
})
export class DmsStageStatusPillComponent {
  readonly status = input.required<string>();
  readonly lg = input(false);

  protected readonly toneClass = computed(() => STATUS_TONE[this.status()] ?? OPEN_TONE);
  protected readonly dotClass = computed(() => DOT_TONE[this.status()] ?? 'bg-text-secondary');
  protected readonly sizeClass = computed(() =>
    this.lg() ? 'px-3 py-1 fs-caption' : 'px-2.5 py-1 fs-label',
  );
  protected readonly label = computed(
    () => STAGE_STATUS_LABEL[this.status()] ?? this.status() ?? '—',
  );
}

import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { taskStatusLabel } from '@shared/ui/status';

/**
 * Task status pill — the design's `.dms-st--*` chip mapped to `@ds` tone tokens.
 * Status drives shape + colour (dot + soft fill + hairline border). `select`
 * adds the caret affordance for the header's status menu trigger.
 */
@Component({
  selector: 'app-dms-status-pill',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span
      class="inline-flex items-center gap-1.5 px-2.5 py-1 border fs-label font-medium leading-tight whitespace-nowrap tabular-nums"
      [class.cursor-pointer]="select()"
      [class.bg-info-soft]="s() === 'InProgress'"
      [class.border-info]="s() === 'InProgress'"
      [class.text-info]="s() === 'InProgress'"
      [class.bg-success-soft]="s() === 'Completed'"
      [class.border-success]="s() === 'Completed'"
      [class.text-success]="s() === 'Completed'"
      [class.bg-danger-soft]="s() === 'Rejected'"
      [class.border-danger]="s() === 'Rejected'"
      [class.text-danger]="s() === 'Rejected'"
      [class.bg-pending-soft]="s() === 'PendingApproval'"
      [class.border-pending]="s() === 'PendingApproval'"
      [class.text-pending]="s() === 'PendingApproval'"
      [class.bg-surface-muted]="isNeutral()"
      [class.border-border]="isNeutral()"
      [class.text-text-secondary]="isNeutral()"
    >
      <span
        class="w-1.5 h-1.5 rounded-full"
        [class.bg-info]="s() === 'InProgress'"
        [class.bg-success]="s() === 'Completed'"
        [class.bg-danger]="s() === 'Rejected'"
        [class.bg-pending]="s() === 'PendingApproval'"
        [class.bg-text-muted]="isNeutral()"
      ></span>
      {{ label() }}
      @if (select()) {
        <span class="fs-micro opacity-60 ms-0.5" aria-hidden="true">▾</span>
      }
    </span>
  `,
})
export class DmsStatusPillComponent {
  readonly status = input.required<string>();
  readonly select = input(false);

  protected readonly s = this.status;
  protected readonly label = computed(() => taskStatusLabel(this.status()));
  protected readonly isNeutral = computed(
    () => this.status() === 'Open' || this.status() === 'Locked',
  );
}

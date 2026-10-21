import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

/**
 * Attachment chip — `.att-chip` from `PERA App - Attachments.html`. Use inside
 * finance tables (invoice rows, ledger rows, variation rows) to surface
 * linked files without leaving the row. The `empty` variant lets a row
 * advertise an "attach receipt" affordance.
 */
@Component({
  selector: 'pera-att-chip',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button type="button" class="att-chip" [class.empty]="empty()" (click)="open.emit()">
      @if (!empty()) {
        <span class="ext">{{ ext().toUpperCase() }}</span>
      }
      <span class="lbl">{{ label() }}</span>
    </button>
  `,
  styles: [
    `
      .att-chip {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        padding: 3px 7px;
        border: 1px solid var(--color-border);
        background: var(--surface);
        font-family: var(--mono);
        font-size: 10px;
        color: var(--color-text-secondary);
        cursor: pointer;
        transition:
          border-color 0.15s,
          color 0.15s;
      }
      .att-chip:hover {
        color: var(--color-text-primary);
        border-color: var(--color-text-muted);
      }
      .att-chip .ext {
        font-weight: 600;
      }
      .att-chip.empty {
        color: var(--color-text-muted);
        border-style: dashed;
      }
    `,
  ],
})
export class PeraAttChipComponent {
  /** Display label (filename or "Attach receipt" for empty). */
  readonly label = input.required<string>();
  /** Extension badge (ignored when `empty`). */
  readonly ext = input<string>('');
  /** Render the dashed-border "no file" affordance. */
  readonly empty = input<boolean>(false);

  readonly open = output<void>();

  readonly tone = computed(() => (this.empty() ? 'empty' : 'filled'));
}

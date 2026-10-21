import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { PeraIconComponent } from '../../components/icon/pera-icon.component';
import { PeraAvatarComponent } from '../../components/avatar/pera-avatar.component';

/** Leading media shown at the start of a list row. */
export interface ListRowLeading {
  type: 'avatar' | 'icon';
  name?: string;
  src?: string;
}

/** A row action rendered as a keyboard-operable icon button. */
export interface ListRowAction {
  id: string;
  icon?: string;
  label: string;
}

/**
 * `pera-list-row` — a single horizontal row for activity feeds, approval
 * queues and deadline lists: an optional leading avatar/icon, a primary line
 * with an optional secondary line beneath it, then a relative age label and
 * inline action buttons at the end.
 *
 * ```html
 * <pera-list-row
 *   [leading]="{ type: 'avatar', name: 'Jane Doe' }"
 *   primary="Invoice #12"
 *   secondary="Pending approval"
 *   [age]="invoice.createdAt"
 *   [actions]="[{ id: 'approve', label: 'Approve', icon: 'check' }]"
 *   (action)="onAction($event)"
 * />
 * ```
 */
@Component({
  selector: 'pera-list-row',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PeraIconComponent, PeraAvatarComponent],
  host: { class: 'block' },
  template: `
    <div class="flex items-center gap-3 px-3 py-2 hover:bg-surface-muted">
      @if (leading(); as l) {
        @if (l.type === 'avatar') {
          <pera-avatar [name]="l.name" [src]="l.src" size="sm" />
        } @else if (l.name) {
          <pera-icon [name]="l.name" [size]="20" class="text-text-muted" />
        }
      }

      <div class="flex-1 min-w-0 flex flex-col">
        <span class="text-sm text-text-primary truncate">{{ primary() }}</span>
        @if (secondary()) {
          <span class="text-xs text-text-muted truncate">{{ secondary() }}</span>
        }
      </div>

      @if (ageLabel()) {
        <span class="text-xs text-text-muted ms-auto whitespace-nowrap">{{ ageLabel() }}</span>
      }

      @if (actions().length) {
        <div class="flex items-center gap-1">
          @for (a of actions(); track a.id) {
            <button
              type="button"
              class="inline-flex items-center justify-center rounded-md px-2 py-1 text-text-muted hover:bg-surface-muted hover:text-text-primary outline-none focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2"
              [attr.aria-label]="a.label"
              (click)="action.emit(a.id)"
            >
              @if (a.icon) {
                <pera-icon [name]="a.icon" [size]="16" />
              } @else {
                <span class="text-xs">{{ a.label }}</span>
              }
            </button>
          }
        </div>
      }
    </div>
  `,
})
export class PeraListRowComponent {
  /** Optional leading avatar or icon shown at the start of the row. */
  readonly leading = input<ListRowLeading | undefined>(undefined);
  /** Main text of the row. */
  readonly primary = input.required<string>();
  /** Optional sub text shown beneath the primary line. */
  readonly secondary = input<string | undefined>(undefined);
  /** Relative/time label shown at the end; a `Date` is formatted locally. */
  readonly age = input<string | Date | undefined>(undefined);
  /** Inline action buttons rendered at the end of the row. */
  readonly actions = input<ListRowAction[]>([]);

  /** Emits the clicked action's id. */
  readonly action = output<string>();

  /** Normalised age label: `Date` -> local date string, string -> as-is. */
  readonly ageLabel = computed(() => {
    const a = this.age();
    if (a == null) return '';
    return a instanceof Date ? a.toLocaleDateString() : a;
  });
}

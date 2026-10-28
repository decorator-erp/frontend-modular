import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { LocaleService } from '@platform/i18n';
import { ProjectStage } from '../../../model/project.model';
import { formatLongDate, daysSince } from '@shared/ui/status';
import { SelectOption } from '@ds';
import { av, PNL, PNL_H, PNL_H_T } from './dms-stage-chrome';
import { DmsStageStatusPillComponent } from './dms-stage-status-pill.component';

type EditField = 'start' | 'target' | 'owner';

/**
 * Stage "Details" info card — the right-rail `.pnl` + `.det-row` list from the
 * DMS Stage Detail design. Renders the at-a-glance metadata of one stage:
 * sequence, status, owner, total weight, start / target dates, elapsed duration
 * and labels. For managers (`canManage`), the start date, target date and owner
 * rows are **click-to-edit**: the value reads as plain text with a hover pencil;
 * clicking it reveals a focused inline control that commits on change / blur and
 * cancels on Escape, then emits the new value so the host persists it (start /
 * target → stage update, owner → stage-team head). Styling comes from the parent
 * page's `.dms-stage` rules plus the inline-edit rules below.
 */
@Component({
  selector: 'app-dms-stage-info',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DmsStageStatusPillComponent],
  styles: [
    `
      /* Inline click-to-edit affordance. Scoped to this component now (emulated
         encapsulation), and expressed with tokens rather than raw pixels. */
      .ie-trigger .ie-pen {
        opacity: 0;
        transition: opacity 0.12s;
      }
      .ie-trigger:hover .ie-pen,
      .ie-trigger:focus-visible .ie-pen {
        opacity: 1;
      }
      select.ie,
      input.ie::-webkit-calendar-picker-indicator {
        cursor: pointer;
      }
      input.ie::-webkit-calendar-picker-indicator {
        opacity: 0.55;
      }
      input.ie::-webkit-calendar-picker-indicator:hover {
        opacity: 0.9;
      }
    `,
  ],
  template: `
    @if (stage(); as s) {
      <div [class]="PNL">
        <div [class]="PNL_H"><div [class]="PNL_H_T">Details</div></div>
        <div class="px-4 pt-1 pb-2">
          <div [class]="DET_ROW">
            <span [class]="DET_K">Sequence</span
            ><span [class]="DET_V">Stage {{ s.order }} of {{ stageCount() || s.order }}</span>
          </div>
          <div [class]="DET_ROW">
            <span [class]="DET_K">Status</span
            ><span [class]="DET_V"><app-dms-stage-status-pill [status]="s.status" /></span>
          </div>

          <!-- Stage owner -->
          <div [class]="DET_ROW">
            <span [class]="DET_K">Stage owner</span>
            @if (!canManage()) {
              <span [class]="DET_V">
                @if (ownerName(); as nm) {
                  <span [class]="AV20">{{ initials(nm) }}</span
                  >{{ nm }}
                } @else {
                  <span class="font-normal text-text-muted">Unassigned</span>
                }
              </span>
            } @else if (editing() === 'owner') {
              <span class="edit-cell block">
                <select
                  #ownerSel
                  [class]="IE"
                  (change)="commitOwner(ownerSel.value)"
                  (blur)="commitOwner(ownerSel.value)"
                  (keydown.escape)="cancelEdit()"
                >
                  <option value="" disabled [selected]="!ownerId()">Assign owner…</option>
                  @for (o of employeeOptions(); track o.value) {
                    <option [value]="o.value" [selected]="o.value === ownerId()">
                      {{ o.label }}
                    </option>
                  }
                </select>
              </span>
            } @else {
              <span [class]="DET_V">
                <button
                  type="button"
                  [class]="IE_TRIGGER"
                  (click)="startEdit('owner')"
                  aria-label="Change stage owner"
                >
                  @if (ownerName(); as nm) {
                    <span [class]="AV20">{{ initials(nm) }}</span
                    >{{ nm }}
                  } @else {
                    <span class="text-text-muted font-normal">Assign owner…</span>
                  }
                  <svg
                    [class]="IE_PEN"
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="1.7"
                  >
                    <path d="M12 20h9" />
                    <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
                  </svg>
                </button>
              </span>
            }
          </div>

          <div [class]="DET_ROW">
            <span [class]="DET_K">Weight</span
            ><span class="v"
              >{{ totalWeight() }}
              <span class="code-c" style="font-weight:400;">pts total</span></span
            >
          </div>

          <!-- Start date -->
          <div [class]="DET_ROW">
            <span [class]="DET_K">Start date</span>
            @if (!canManage()) {
              <span class="v" [class.muted]="!startDisplay()">
                @if (startDisplay(); as sd) {
                  {{ longDate(sd, locale.locale()) }}
                } @else {
                  Not set
                }
              </span>
            } @else if (editing() === 'start') {
              <span class="edit-cell block">
                <input
                  #startInp
                  type="date"
                  [class]="IE"
                  [value]="startValue()"
                  (change)="commitStart(startInp.value)"
                  (blur)="commitStart(startInp.value)"
                  (keydown.escape)="cancelEdit()"
                />
              </span>
            } @else {
              <span [class]="DET_V">
                <button
                  type="button"
                  [class]="IE_TRIGGER"
                  (click)="startEdit('start')"
                  aria-label="Change start date"
                >
                  @if (startDisplay(); as sd) {
                    {{ longDate(sd, locale.locale()) }}
                  } @else {
                    <span class="text-text-muted font-normal">Set start date…</span>
                  }
                  <svg
                    [class]="IE_PEN"
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="1.7"
                  >
                    <path d="M12 20h9" />
                    <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
                  </svg>
                </button>
              </span>
            }
          </div>

          <!-- Target / Completed date -->
          <div [class]="DET_ROW">
            <span [class]="DET_K">{{ s.completedOnUtc ? 'Completed' : 'Target date' }}</span>
            @if (s.completedOnUtc) {
              <span [class]="DET_V">{{ longDate(s.completedOnUtc, locale.locale()) }}</span>
            } @else if (!canManage()) {
              <span class="v" [class.muted]="!targetDisplay()">
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.7"
                >
                  <rect x="3" y="4" width="18" height="17" />
                  <path d="M3 9h18M8 2v4M16 2v4" />
                </svg>
                @if (targetDisplay(); as td) {
                  {{ longDate(td, locale.locale()) }}
                } @else {
                  —
                }
              </span>
            } @else if (editing() === 'target') {
              <span class="edit-cell block">
                <input
                  #targetInp
                  type="date"
                  [class]="IE"
                  [value]="targetValue()"
                  [attr.min]="startValue() || null"
                  (change)="commitTarget(targetInp.value)"
                  (blur)="commitTarget(targetInp.value)"
                  (keydown.escape)="cancelEdit()"
                />
              </span>
            } @else {
              <span [class]="DET_V">
                <button
                  type="button"
                  [class]="IE_TRIGGER"
                  (click)="startEdit('target')"
                  aria-label="Change target date"
                >
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="1.7"
                  >
                    <rect x="3" y="4" width="18" height="17" />
                    <path d="M3 9h18M8 2v4M16 2v4" />
                  </svg>
                  @if (targetDisplay(); as td) {
                    {{ longDate(td, locale.locale()) }}
                  } @else {
                    <span class="text-text-muted font-normal">Set target date…</span>
                  }
                  <svg
                    [class]="IE_PEN"
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="1.7"
                  >
                    <path d="M12 20h9" />
                    <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
                  </svg>
                </button>
              </span>
            }
          </div>

          <div [class]="DET_ROW">
            <span [class]="DET_K">Duration</span
            ><span [class]="DET_V" class="text-text-muted font-normal!">{{ durationLabel() }}</span>
          </div>
        </div>
      </div>
    }
  `,
})
export class DmsStageInfoComponent {
  protected readonly PNL = PNL;
  protected readonly PNL_H = PNL_H;
  protected readonly PNL_H_T = PNL_H_T;
  protected readonly AV20 = av(20, true);
  protected readonly DET_ROW =
    'grid grid-cols-[6.5rem_minmax(0,1fr)] gap-2.5 items-center py-2.5 border-b border-border-soft last:border-b-0';
  protected readonly DET_K = 'fs-label text-text-muted';
  protected readonly DET_V =
    'fs-caption text-text-primary font-medium flex items-center gap-2 flex-wrap';
  protected readonly IE_TRIGGER =
    'ie-trigger flex items-center gap-2 w-full min-h-6 bg-transparent border border-transparent px-1.5 py-1 -mx-1.5 -my-1 rounded font-[inherit] fs-caption font-medium text-text-primary text-start cursor-pointer transition-colors hover:bg-hover hover:border-border focus-visible:outline-none focus-visible:bg-hover focus-visible:border-accent';
  protected readonly IE_PEN = 'ie-pen ms-auto text-text-muted shrink-0';
  protected readonly IE =
    'ie w-full box-border h-8 font-[inherit] fs-caption font-medium text-text-primary bg-surface border border-accent rounded px-2 py-1 outline-none focus:ring-3 focus:ring-accent-soft';

  /** The stage whose metadata this card describes. */
  readonly stage = input.required<ProjectStage>();
  /** Total stages in the workflow, for the "Stage N of M" sequence line. */
  readonly stageCount = input(0);
  /** Σ of task weights in the stage (the page already aggregates the tasks). */
  readonly totalWeight = input(0);
  /** Resolved owner display name, if the page could resolve one. */
  readonly ownerName = input<string | null>(null);
  /** When true, the start / target / owner rows become click-to-edit. */
  readonly canManage = input(false);
  /** Current owner (stage-team head) id — drives the owner select. */
  readonly ownerId = input<string | null>(null);
  /** Employee picklist for the owner select. */
  readonly employeeOptions = input<SelectOption[]>([]);

  /** Persist requests — the host owns the API calls (start/target → stage, owner → team head). */
  readonly saveStartDate = output<string>();
  readonly saveTargetDate = output<string>();
  readonly saveOwner = output<string>();

  readonly locale = inject(LocaleService);
  private readonly host = inject(ElementRef) as ElementRef<HTMLElement>;
  protected readonly longDate = formatLongDate;

  /** Which field, if any, is currently in its inline editor. */
  protected readonly editing = signal<EditField | null>(null);
  /** Guards a single edit session so `change` + `blur` can't double-commit. */
  private committed = false;

  /** Planned dates as `YYYY-MM-DD` for the inline date inputs. */
  protected readonly startValue = computed(
    () => this.stage().estimatedStartDate?.slice(0, 10) ?? '',
  );
  protected readonly targetValue = computed(
    () => this.stage().estimatedEndDate?.slice(0, 10) ?? '',
  );

  /** Planned start (what the inline editor sets), falling back to the actual start. */
  protected readonly startDisplay = computed(() => {
    const s = this.stage();
    return s.estimatedStartDate ?? s.startedOnUtc;
  });
  /** Planned target (what the inline editor sets), falling back to the actual end. */
  protected readonly targetDisplay = computed(() => {
    const s = this.stage();
    return s.estimatedEndDate ?? s.completedOnUtc;
  });

  startEdit(field: EditField): void {
    this.committed = false;
    this.editing.set(field);
    // Focus the revealed control on the next tick (the view re-renders first).
    setTimeout(() => {
      const selector = field === 'owner' ? 'select.ie' : 'input.ie';
      const el = this.host.nativeElement.querySelector(`.edit-cell ${selector}`);
      (el as HTMLElement | null)?.focus();
    });
  }

  stopEdit(): void {
    this.editing.set(null);
  }

  /** Escape — abandon the edit without persisting (also blocks the trailing blur). */
  cancelEdit(): void {
    this.committed = true;
    this.stopEdit();
  }

  // Commit on BOTH change and blur (guarded): native date pickers can dispatch
  // these in either order, and tearing the input down on blur would otherwise
  // drop the change before it persists.
  commitStart(value: string): void {
    if (this.committed) return;
    this.committed = true;
    if (value && value !== this.startValue()) this.saveStartDate.emit(value);
    this.stopEdit();
  }

  commitTarget(value: string): void {
    if (this.committed) return;
    this.committed = true;
    if (value && value !== this.targetValue()) this.saveTargetDate.emit(value);
    this.stopEdit();
  }

  commitOwner(value: string): void {
    if (this.committed) return;
    this.committed = true;
    if (value && value !== (this.ownerId() ?? '')) this.saveOwner.emit(value);
    this.stopEdit();
  }

  protected initials(name: string): string {
    const parts = name.trim().split(/\s+/);
    const a = parts[0]?.[0] ?? '';
    const b = parts.length > 1 ? parts[parts.length - 1][0] : '';
    return (a + b).toUpperCase() || '?';
  }

  /**
   * Span between the start and target dates. Prefers the planned window the user
   * sets (estimated → estimated); once the stage actually completes it reports the
   * realized total (actual start → actual end); a started-but-open stage with no
   * plan falls back to elapsed-so-far.
   */
  protected readonly durationLabel = computed(() => {
    const s = this.stage();
    const plural = (n: number) => `${n} ${n === 1 ? 'day' : 'days'}`;

    if (s.completedOnUtc && (s.startedOnUtc || s.estimatedStartDate)) {
      const start = (s.startedOnUtc ?? s.estimatedStartDate)!;
      const days = Math.max(
        0,
        Math.round((Date.parse(s.completedOnUtc) - Date.parse(start)) / 86_400_000),
      );
      return `${plural(days)} total`;
    }
    if (s.estimatedStartDate && s.estimatedEndDate) {
      const days = Math.max(
        0,
        Math.round(
          (Date.parse(s.estimatedEndDate) - Date.parse(s.estimatedStartDate)) / 86_400_000,
        ),
      );
      return `${plural(days)} planned`;
    }
    if (s.startedOnUtc) return `${plural(daysSince(s.startedOnUtc))} elapsed`;
    return 'Not scheduled';
  });
}

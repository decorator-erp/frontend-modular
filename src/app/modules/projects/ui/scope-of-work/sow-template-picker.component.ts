import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  afterRenderEffect,
  computed,
  inject,
  input,
  output,
} from '@angular/core';
import type { TemplateStage } from '@modules/library';
import { PeraButtonComponent, PeraChipComponent, PeraCurrencyComponent } from '@ds';
import { CatalogService } from '@platform/i18n/catalog.service';
import { SowTemplateOption } from '../../model/scope-of-work.model';

const ROW_BUTTON =
  'inline-flex items-center justify-center h-7 px-2.5 fs-body-sm font-medium whitespace-nowrap ' +
  'border cursor-pointer outline-none focus-visible:outline-2 focus-visible:outline-accent ' +
  'focus-visible:outline-offset-2 disabled:opacity-45 disabled:cursor-not-allowed';
const ROW_ADD = 'bg-accent text-text-on-accent border-accent hover:bg-accent-hover';
const ROW_ADDED = 'bg-surface text-text-primary border-border hover:bg-surface-muted';

/**
 * The stage-template picker (B6): template pills, the selected template's stages ("N tasks ·
 * default fee X EGP"), Add / Added · remove per stage, and Add whole template. Presentational:
 * it emits, the page calls the store. The scope API takes template **stage** ids (C §8.4.2).
 */
@Component({
  selector: 'app-sow-template-picker',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PeraButtonComponent, PeraChipComponent, PeraCurrencyComponent],
  host: { class: 'block' },
  template: `
    <div class="bg-surface-muted border border-border p-4 flex flex-col gap-3">
      <div class="flex items-center justify-between gap-2 flex-wrap">
        <span class="fs-caption font-semibold text-text-secondary">
          {{ catalog.t('sow.stageTemplates') }}
        </span>
        @if (selectedTemplateId()) {
          <pera-button
            size="sm"
            [disabled]="busy()"
            (click)="addTemplate.emit(selectedTemplateId()!)"
          >
            {{ catalog.t('sow.addWholeTemplate') }}
          </pera-button>
        }
      </div>

      @if (templates().length === 0) {
        <p class="m-0 fs-body-sm text-text-muted">{{ catalog.t('sow.noTemplates') }}</p>
      } @else {
        <div
          class="flex flex-wrap gap-2"
          role="group"
          [attr.aria-label]="catalog.t('sow.templates')"
        >
          @for (t of templates(); track t.id) {
            <pera-chip [on]="t.id === selectedTemplateId()" (toggled)="selectTemplate.emit(t.id)">
              {{ t.name }}
            </pera-chip>
          }
        </div>
      }

      @if (selectedTemplateId() && !loading() && stages().length === 0) {
        <p class="m-0 fs-body-sm text-text-muted">{{ catalog.t('sow.noStages') }}</p>
      }
      @for (s of stages(); track s.id) {
        <div
          [attr.data-stage-row]="s.id"
          class="flex flex-wrap items-center gap-x-4 gap-y-2 px-3.5 py-3 border border-border bg-surface"
        >
          <div class="flex-1 min-w-48 flex flex-col gap-0.5">
            <strong class="text-sm text-text-primary">{{ s.name }}</strong>
            <span class="fs-caption text-text-muted">
              {{ catalog.t('sow.stageTasks', { count: s.taskCount }) }}
              @if (s.defaultFee !== null) {
                · {{ catalog.t('sow.defaultFee') }}
                <pera-currency [amount]="s.defaultFee" code="EGP" />
              }
            </span>
          </div>
          @if (picked().has(s.id)) {
            <button
              type="button"
              class="${ROW_BUTTON} ${ROW_ADDED}"
              [disabled]="busy()"
              [attr.aria-label]="catalog.t('sow.addedRemove') + ' ' + s.name"
              (click)="refocus = s.id; removeStage.emit(s.id)"
            >
              {{ catalog.t('sow.addedRemove') }}
            </button>
          } @else {
            <button
              type="button"
              class="${ROW_BUTTON} ${ROW_ADD}"
              [disabled]="busy()"
              [attr.aria-label]="catalog.t('sow.add') + ' ' + s.name"
              (click)="refocus = s.id; addStage.emit(s.id)"
            >
              {{ catalog.t('sow.add') }}
            </button>
          }
        </div>
      }
    </div>
  `,
})
export class SowTemplatePickerComponent {
  protected readonly catalog = inject(CatalogService);

  readonly templates = input.required<SowTemplateOption[]>();
  readonly selectedTemplateId = input<string | null>(null);
  /** The selected template's stages (`GET /api/stage-templates/{id}/stages`). */
  readonly stages = input.required<TemplateStage[]>();
  /** `sourceStageId` of every item already in the scope. */
  readonly pickedStageIds = input<readonly string[]>([]);
  readonly loading = input(false);
  /** A write is in flight: the buttons wait. */
  readonly busy = input(false);

  readonly selectTemplate = output<string>();
  /** `POST …/items { sourceStageIds: [id] }`. */
  readonly addStage = output<string>();
  /** `DELETE …/items/{itemId}` of the item whose `sourceStageId` matches. */
  readonly removeStage = output<string>();
  /** `POST …/items/from-template/{templateId}`. */
  readonly addTemplate = output<string>();

  protected readonly picked = computed(() => new Set(this.pickedStageIds()));

  /** FINDING-7-6: the stage whose Add / Added · remove was pressed, refocused once not busy. */
  protected refocus: string | null = null;
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  constructor() {
    afterRenderEffect(() => {
      this.picked();
      if (this.busy() || !this.refocus) return;
      const id = this.refocus;
      this.refocus = null;
      this.host.nativeElement
        .querySelector<HTMLElement>(`[data-stage-row="${id}"] button`)
        ?.focus();
    });
  }
}

import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  linkedSignal,
  output,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  PeraCurrencyComponent,
  PeraDateInputComponent,
  PeraFormFieldComponent,
  PeraInputComponent,
  PeraMoneyInputComponent,
  PeraTextareaComponent,
} from '@ds';
import type { CatalogKey } from '@platform/i18n/catalog/en';
import { CatalogService } from '@platform/i18n/catalog.service';
import { formatCairoDate } from '@platform/i18n/intl-locale';
import { ScopeOfWork, UpdateScopeOfWorkHeaderRequest } from '../../model/scope-of-work.model';
import type { SowHeaderStatus } from '../../stores/scope-of-work.store';
import { InnerInputLabelDirective } from './inner-input-label.directive';

/** Server limits (`UpdateScopeOfWorkHeaderCommandValidator`, C §8.4.15). */
const DURATION_MIN = 1;
const DURATION_MAX = 3650;
const START_MIN = '2000-01-01';
const START_MAX = '2100-12-31';
const ADJUSTMENT_MAX = 1_000_000_000_000;
const ADJUSTMENT_NOTE_MAX = 500;
const NOTES_MAX = 2000;

const CARD = 'bg-surface border border-border p-5 flex flex-col gap-3 min-w-0';
const HEADING = 'm-0 fs-h3 font-semibold text-text-primary';

type HeaderField = 'duration' | 'start' | 'adjustment' | 'adjustmentNote' | 'notes';

/**
 * The scope-of-work header (B7-B9): duration, planned start and the server's estimated end;
 * the server's subtotal and total, the adjustment (negative = discount) with its reason, and
 * the notes.
 * Presentational: every change emits ONE full header (all five fields, `adjustmentAmount`
 * always), built from the stored values plus the change, and the page calls the store. There
 * is no "Save draft": each change saves itself and the quiet status says so (C §8.4.6-7).
 */
@Component({
  selector: 'app-sow-summary',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    InnerInputLabelDirective,
    PeraCurrencyComponent,
    PeraDateInputComponent,
    PeraFormFieldComponent,
    PeraInputComponent,
    PeraMoneyInputComponent,
    PeraTextareaComponent,
  ],
  host: { class: 'flex flex-col gap-4 min-w-0' },
  template: `
    <p class="m-0 min-h-5 fs-caption text-text-muted text-end" role="status" aria-live="polite">
      {{ statusText() }}
    </p>

    <section class="${CARD}" aria-labelledby="sow-duration-heading">
      <h2 id="sow-duration-heading" class="${HEADING}">{{ catalog.t('sow.duration') }}</h2>
      <div class="grid grid-cols-2 gap-3">
        <pera-form-field [label]="catalog.t('sow.durationDays')" [error]="errorText('duration')">
          <pera-input
            type="number"
            [appInnerInputLabel]="catalog.t('sow.durationDays')"
            [ngModel]="scope().durationDays ?? ''"
            [disabled]="!editable()"
            [error]="errors()['duration'] ? 'invalid' : undefined"
            (change)="onDuration($event)"
          />
        </pera-form-field>
        <pera-form-field [label]="catalog.t('sow.plannedStart')" [error]="errorText('start')">
          <pera-date-input
            [appInnerInputLabel]="catalog.t('sow.plannedStart')"
            [min]="startMin"
            [max]="startMax"
            [ngModel]="scope().plannedStartDate ?? ''"
            [disabled]="!editable()"
            [error]="errors()['start'] ? 'invalid' : undefined"
            (change)="onStart($event)"
          />
        </pera-form-field>
      </div>
      <div class="flex items-center justify-between gap-3 bg-surface-muted px-3 py-2.5">
        <span class="text-text-secondary">{{ catalog.t('sow.estimatedEnd') }}</span>
        <strong class="text-text-primary" data-estimated-end>{{ endText() }}</strong>
      </div>
    </section>

    <section class="${CARD}" aria-labelledby="sow-fees-heading">
      <h2 id="sow-fees-heading" class="${HEADING}">{{ catalog.t('sow.fees') }}</h2>
      <div class="flex items-center justify-between gap-3">
        <span class="text-text-secondary">{{ catalog.t('sow.subtotal') }}</span>
        <pera-currency data-subtotal [amount]="scope().subtotal" code="EGP" />
      </div>
      <pera-form-field [label]="catalog.t('sow.adjustment')" [error]="errorText('adjustment')">
        <pera-money-input
          [appInnerInputLabel]="catalog.t('sow.adjustment')"
          [allowNegative]="true"
          [ngModel]="scope().adjustmentAmount"
          [disabled]="!editable()"
          [error]="errors()['adjustment'] ? 'invalid' : undefined"
          (change)="onAdjustment($event)"
        />
      </pera-form-field>
      @if (adjustment() !== 0) {
        <pera-form-field
          data-adjustment-note
          [label]="catalog.t('sow.adjustmentNote')"
          [error]="errorText('adjustmentNote')"
        >
          <pera-input
            [appInnerInputLabel]="catalog.t('sow.adjustmentNote')"
            [placeholder]="catalog.t('sow.adjustmentNotePlaceholder')"
            [ngModel]="scope().adjustmentNote ?? ''"
            [disabled]="!editable()"
            [error]="errors()['adjustmentNote'] ? 'invalid' : undefined"
            (change)="onAdjustmentNote($event)"
          />
        </pera-form-field>
      }
      <div class="flex items-center justify-between gap-3 border-t border-border pt-3 mt-1">
        <strong class="text-text-primary">{{ catalog.t('sow.total') }}</strong>
        <pera-currency data-total [amount]="scope().total" code="EGP" />
      </div>
    </section>

    <section class="${CARD}">
      <pera-form-field [label]="catalog.t('sow.notes')" [error]="errorText('notes')">
        <pera-textarea
          [appInnerInputLabel]="catalog.t('sow.notes')"
          [rows]="3"
          [ngModel]="scope().notes ?? ''"
          [disabled]="!editable()"
          [error]="errors()['notes'] ? 'invalid' : undefined"
          (change)="onNotes($event)"
        />
      </pera-form-field>
    </section>
  `,
})
export class SowSummaryComponent {
  protected readonly catalog = inject(CatalogService);

  readonly scope = input.required<ScopeOfWork>();
  /** `scope.manage`, a Draft and a Stage-workflow project (B11, B12, B15). */
  readonly editable = input(false);
  /** B9: the store's header save status. */
  readonly saveStatus = input<SowHeaderStatus>('idle');

  /** One full header, ready for `PUT …/scope-of-work` (B9). */
  readonly headerChange = output<UpdateScopeOfWorkHeaderRequest>();

  protected readonly startMin = START_MIN;
  protected readonly startMax = START_MAX;

  /** Client-side check failures (they block the call, B7). */
  protected readonly errors = signal<Partial<Record<HeaderField, CatalogKey>>>({});

  /**
   * B8: the adjustment as last entered (the stored one until then), so the reason field shows
   * as soon as the adjustment is ≠ 0.
   */
  protected readonly adjustment = linkedSignal(() => this.scope().adjustmentAmount);

  protected readonly statusText = computed(() => {
    const status = this.saveStatus();
    if (status === 'saving') return this.catalog.t('sow.saving');
    if (status === 'saved') return this.catalog.t('sow.saved');
    return '';
  });

  /** B7: the server's `estimatedEndDate`; "Set a start date" before a start, "—" with no duration. */
  protected readonly endText = computed(() => {
    const s = this.scope();
    if (s.estimatedEndDate) {
      return formatCairoDate(`${s.estimatedEndDate}T00:00:00Z`, this.catalog.locale());
    }
    return s.durationDays ? this.catalog.t('sow.setStartDate') : '—';
  });

  protected errorText(field: HeaderField): string | undefined {
    const key = this.errors()[field];
    return key ? this.catalog.t(key) : undefined;
  }

  protected onDuration(event: Event): void {
    if (!this.editable()) return;
    const raw = valueOf(event).trim();
    const days = raw === '' ? null : Number(raw);
    if (days !== null && (!Number.isInteger(days) || days < DURATION_MIN || days > DURATION_MAX)) {
      this.setError('duration', 'sow.durationInvalid');
      return;
    }
    this.setError('duration', null);
    if (days !== this.scope().durationDays) this.emit({ durationDays: days });
  }

  protected onStart(event: Event): void {
    if (!this.editable()) return;
    const raw = valueOf(event).trim();
    const date = raw === '' ? null : raw;
    if (
      date !== null &&
      (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date < START_MIN || date > START_MAX)
    ) {
      this.setError('start', 'sow.startInvalid');
      return;
    }
    this.setError('start', null);
    if (date !== this.scope().plannedStartDate) this.emit({ plannedStartDate: date });
  }

  /** B8: negative allowed (a discount), ±1e12. */
  protected onAdjustment(event: Event): void {
    if (!this.editable()) return;
    const raw = valueOf(event).replace(/[,\s]/g, '');
    const amount = raw === '' ? 0 : Number(raw);
    if (!Number.isFinite(amount) || Math.abs(amount) > ADJUSTMENT_MAX) {
      this.setError('adjustment', 'sow.adjustmentInvalid');
      return;
    }
    this.setError('adjustment', null);
    this.adjustment.set(amount);
    if (amount !== this.scope().adjustmentAmount) this.emit({ adjustmentAmount: amount });
  }

  /** B8: the reason for the adjustment, ≤500. */
  protected onAdjustmentNote(event: Event): void {
    this.onText(event, 'adjustmentNote', ADJUSTMENT_NOTE_MAX, 'sow.adjustmentNoteInvalid');
  }

  /** B8: the notes, ≤2000. */
  protected onNotes(event: Event): void {
    this.onText(event, 'notes', NOTES_MAX, 'sow.notesInvalid');
  }

  private onText(
    event: Event,
    field: 'adjustmentNote' | 'notes',
    max: number,
    invalid: CatalogKey,
  ): void {
    if (!this.editable()) return;
    const text = valueOf(event).trim() || null;
    if (text !== null && text.length > max) {
      this.setError(field, invalid);
      return;
    }
    this.setError(field, null);
    if (text !== this.scope()[field]) this.emit({ [field]: text });
  }

  /** The stored header plus `change`: all five fields, every time (a full replace, C §8.4.6). */
  private emit(change: Partial<UpdateScopeOfWorkHeaderRequest>): void {
    const s = this.scope();
    this.headerChange.emit({
      durationDays: s.durationDays,
      plannedStartDate: s.plannedStartDate,
      adjustmentAmount: s.adjustmentAmount,
      adjustmentNote: s.adjustmentNote,
      notes: s.notes,
      ...change,
    });
  }

  private setError(field: HeaderField, key: CatalogKey | null): void {
    this.errors.update((all) => {
      const next = { ...all };
      if (key) next[field] = key;
      else delete next[field];
      return next;
    });
  }
}

function valueOf(event: Event): string {
  const target = event.target as HTMLInputElement | HTMLTextAreaElement | null;
  return target?.value ?? '';
}

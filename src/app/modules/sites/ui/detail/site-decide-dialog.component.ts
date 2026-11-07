import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  PERA_MODAL_DATA,
  PeraFormFieldComponent,
  PeraFormModalComponent,
  PeraModalRef,
  PeraTextareaComponent,
} from '@ds';
import { CatalogService } from '@platform/i18n/catalog.service';
import type { WriteOutcome } from '../../model/site-errors';
import { DECISION_NOTE_MAX, validateDecisionNote } from '../../model/site-validation';

export interface SiteDecideDialogData {
  approve: boolean;
  code: string;
  save: (note: string | null) => Promise<WriteOutcome>;
}

/**
 * sites S-4: Approve / Reject with an optional note ≤1000 (DEVIATION-S2; prototype `sites.js:425-433`).
 * A 403 `sites.SelfApprovalNotAllowed` (the submitter, DEVIATION-S1) shows inline here, not as a toast.
 */
@Component({
  selector: 'app-site-decide-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, PeraFormModalComponent, PeraFormFieldComponent, PeraTextareaComponent],
  template: `
    <pera-form-modal
      size="md"
      [title]="title"
      [submitLabel]="catalog.t(data.approve ? 'sv.approve' : 'sv.reject')"
      [cancelLabel]="catalog.t('sv.cancel')"
      [submitting]="saving()"
      [errorMessage]="banner()"
      [errorCode]="bannerCode()"
      (submitted)="submit()"
      (cancelled)="ref.close()"
    >
      <pera-form-field
        [label]="catalog.t('sv.decisionNote')"
        [hint]="
          catalog.t(data.approve ? 'sv.noteHintApprove' : 'sv.noteHintReject') +
          ' (' +
          note().length +
          '/' +
          max +
          ')'
        "
        [error]="noteError() ?? undefined"
      >
        <pera-textarea
          dir="auto"
          [rows]="4"
          [placeholder]="catalog.t(data.approve ? 'sv.notePhApprove' : 'sv.notePhReject')"
          [ngModel]="note()"
          (ngModelChange)="note.set($event ?? '')"
          data-note
        />
      </pera-form-field>
    </pera-form-modal>
  `,
})
export class SiteDecideDialogComponent {
  readonly ref = inject(PeraModalRef) as PeraModalRef<boolean>;
  readonly data = inject(PERA_MODAL_DATA) as SiteDecideDialogData;
  protected readonly catalog = inject(CatalogService);

  readonly max = DECISION_NOTE_MAX;
  readonly note = signal('');
  readonly saving = signal(false);
  readonly banner = signal<string | null>(null);
  readonly bannerCode = signal<string | null>(null);
  readonly noteError = signal<string | null>(null);

  readonly title = this.catalog.t(this.data.approve ? 'sv.approveQ' : 'sv.rejectQ', {
    c: this.data.code,
  });

  async submit(): Promise<void> {
    if (this.saving()) return;
    const note = this.note().trim() || null;
    const invalid = validateDecisionNote(note);
    this.noteError.set(invalid ? this.catalog.t(invalid.key) : null);
    if (invalid) return;
    this.banner.set(null);
    this.bannerCode.set(null);
    this.saving.set(true);
    const outcome = await this.data.save(note);
    this.saving.set(false);
    if (outcome.ok) return this.ref.close(true);
    if (outcome.reloaded) return this.ref.close(false);
    this.noteError.set(outcome.fieldErrors?.['note'] ?? null);
    this.banner.set(outcome.message ?? null);
    this.bannerCode.set(outcome.code ?? null);
  }
}

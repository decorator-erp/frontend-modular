import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { catchError, of } from 'rxjs';
import { CrmLeadService, type CrmLead } from '../../data/crm-lead.service';
import { ErrorHandlerService, friendly } from '@platform/http/error-handler.service';
import { CatalogService } from '@platform/i18n/catalog.service';
import { ToastService } from '@platform/feedback/toast.service';
import { ParsedApiError } from '@platform/types';
import { ClientSearchService } from '@modules/clients';
import { ServerErrorsDirective, firstErrorMessage } from '@shared/forms';
import {
  PERA_MODAL_DATA,
  PeraAlertComponent,
  PeraFormFieldComponent,
  PeraFormModalComponent,
  PeraModalRef,
  PeraSelectComponent,
  SelectOption,
} from '@ds';

export interface ConvertLeadDialogData {
  leadId: string;
  lead?: CrmLead;
}

/**
 * Convert a lead to an existing client (`POST /api/crm/leads/{id}/convert`). Adds the
 * design handoff's "What carries over" preview + comms note. The convert payload is slim
 * (`existingClientId`) — the preview is a read-only client-side hint (Hop 1/Hop 2).
 */
@Component({
  selector: 'app-crm-convert-lead',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    ServerErrorsDirective,
    PeraAlertComponent,
    PeraFormModalComponent,
    PeraFormFieldComponent,
    PeraSelectComponent,
  ],
  template: `
    <pera-form-modal
      eyebrow="POST /api/crm/leads/{id}/convert"
      [title]="catalog.t('convert.title')"
      [subtitle]="catalog.t('convert.sub')"
      size="md"
      permission="crm.leads.convert"
      [submitLabel]="catalog.t('convert.submit')"
      [submitting]="submitting()"
      [errorMessage]="serverError()?.generalMessage ?? null"
      [errorCode]="serverError()?.code ?? null"
      (submitted)="submit()"
      (cancelled)="close()"
    >
      <div [formGroup]="form" [serverErrors]="serverError()" class="flex flex-col gap-4">
        <div class="flex flex-col gap-1">
          <span class="fs-body-sm font-medium text-text-secondary">{{
            catalog.t('convert.lead')
          }}</span>
          <div
            class="min-h-icon-lg px-3 py-2 border border-border bg-surface-muted fs-body-sm text-text-primary"
          >
            {{ leadName }}
          </div>
        </div>

        <pera-form-field
          [label]="catalog.t('convert.client')"
          [required]="true"
          [error]="errorOf('existingClientId')"
        >
          <pera-select
            formControlName="existingClientId"
            [options]="clients()"
            [placeholder]="catalog.t('convert.clientPh')"
            [error]="errorOf('existingClientId')"
          />
        </pera-form-field>

        <!-- What carries over -->
        <div class="border border-border bg-bg">
          <div
            class="px-3 py-2 border-b border-border fs-label uppercase tracking-wide text-text-muted"
          >
            {{ catalog.t('convert.carryTitle') }}
          </div>
          <div class="flex gap-2.5 px-3 py-2.5 border-b border-border">
            <span class="text-accent" aria-hidden="true">✓</span>
            <p class="fs-caption text-text-secondary leading-relaxed m-0">
              <span class="font-semibold text-text-primary">{{
                catalog.t('convert.carryClientK')
              }}</span>
              {{ catalog.t('convert.carryClientV') }}
            </p>
          </div>
          <div class="flex gap-2.5 px-3 py-2.5">
            <span class="text-accent" aria-hidden="true">✓</span>
            <p class="fs-caption text-text-secondary leading-relaxed m-0">
              <span class="font-semibold text-text-primary">{{
                catalog.t('convert.carryProjectK')
              }}</span>
              {{ catalog.t('convert.carryProjectV') }}
            </p>
          </div>
        </div>

        <pera-alert tone="info">{{ catalog.t('convert.info') }}</pera-alert>
      </div>
    </pera-form-modal>
  `,
})
export class CrmConvertLeadComponent {
  private readonly fb = inject(FormBuilder);
  private readonly leads = inject(CrmLeadService);
  private readonly clientSearch = inject(ClientSearchService);
  private readonly errorHandler = inject(ErrorHandlerService);
  private readonly toast = inject(ToastService);
  private readonly modalRef = inject(PeraModalRef) as PeraModalRef<boolean>;
  private readonly data = inject(PERA_MODAL_DATA) as ConvertLeadDialogData;
  protected readonly catalog = inject(CatalogService);

  protected readonly leadName = this.data.lead
    ? `${this.data.lead.firstName} ${this.data.lead.lastName}`.trim()
    : '';

  protected readonly clients = signal<SelectOption[]>([]);
  readonly serverError = signal<ParsedApiError | null>(null);
  readonly submitting = signal(false);

  readonly form = this.fb.nonNullable.group({
    existingClientId: [null as string | null, [Validators.required]],
  });

  constructor() {
    this.clientSearch
      .search({ pageSize: 200, isActive: true })
      .pipe(catchError(() => of({ items: [], totalCount: 0, pageIndex: 1, totalPages: 1 })))
      .subscribe((paged) =>
        this.clients.set(
          paged.items.map((c) => ({
            value: c.id,
            label: [c.firstName, c.lastName].filter(Boolean).join(' ') || (c.email ?? c.id),
          })),
        ),
      );
  }

  errorOf(name: string): string {
    const control = this.form.get(name);
    return control && control.touched && control.errors ? firstErrorMessage(control.errors) : '';
  }

  close(): void {
    this.modalRef.close(false);
  }

  submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.submitting.set(true);
    this.serverError.set(null);
    this.leads
      .convert(this.data.leadId, {
        existingClientId: this.form.getRawValue().existingClientId ?? '',
      })
      .subscribe({
        next: () => {
          this.toast.show({ tone: 'success', message: this.catalog.t('convert.saved') });
          this.modalRef.close(true);
        },
        error: (err) => {
          const parsed = this.errorHandler.parse(err);
          this.serverError.set({ ...parsed, generalMessage: friendly(parsed) });
          this.submitting.set(false);
        },
      });
  }
}

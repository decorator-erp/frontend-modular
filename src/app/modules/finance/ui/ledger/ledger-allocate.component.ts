import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { InvoiceService } from '../../data/invoice.service';
import { LedgerEntryService } from '../../data/ledger-entry.service';
import { ErrorHandlerService } from '@platform/http/error-handler.service';
import { ToastService } from '@platform/feedback/toast.service';
import { InvoiceResponse } from '../../model/invoice.model';
import {
  moneyDecimalsValidator,
  moneyMaxValidator,
  moneyPositiveValidator,
} from '../../model/validation/validators.finance';
import { applyFinanceServerError } from '../../model/validation/finance-error-mapping';
import {
  PERA_MODAL_DATA,
  PeraAlertComponent,
  PeraButtonComponent,
  PeraFormFieldComponent,
  PeraModalRef,
  PeraMoneyInputComponent,
  PeraSelectComponent,
  SelectOption,
} from '@ds';

export interface LedgerAllocateData {
  projectId: string;
  entryId: string;
  /** Unallocated remainder on the source entry. */
  unallocated: string;
}

/** Allocate (part of) a payment to a single outstanding invoice — §F-LA. */
@Component({
  selector: 'app-ledger-allocate',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    PeraAlertComponent,
    PeraButtonComponent,
    PeraFormFieldComponent,
    PeraMoneyInputComponent,
    PeraSelectComponent,
  ],
  template: `
    <form
      [formGroup]="form"
      (ngSubmit)="submit()"
      class="flex flex-col gap-4 p-5 min-w-[var(--w-dialog)] bg-surface border border-border rounded-card"
    >
      <h2 class="m-0 fs-body font-semibold">Allocate to invoice</h2>

      @if (alert(); as a) {
        <pera-alert tone="danger">{{ a }}</pera-alert>
      }

      <pera-form-field
        label="Invoice"
        [required]="true"
        hint="Outstanding invoices for this project."
      >
        <pera-select
          formControlName="invoiceId"
          [options]="options()"
          placeholder="Pick an invoice"
        />
      </pera-form-field>

      <pera-form-field label="Amount" [required]="true" [hint]="hintText()">
        <pera-money-input formControlName="amount" />
      </pera-form-field>

      <div class="flex justify-end gap-2 pt-1">
        <pera-button type="button" variant="ghost" (click)="cancel()">Cancel</pera-button>
        <pera-button type="submit" variant="primary" [disabled]="form.invalid || saving()">
          {{ saving() ? 'Allocating…' : 'Allocate' }}
        </pera-button>
      </div>
    </form>
  `,
})
export class LedgerAllocateComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly invoices = inject(InvoiceService);
  private readonly ledger = inject(LedgerEntryService);
  private readonly errors = inject(ErrorHandlerService);
  private readonly toast = inject(ToastService);
  private readonly ref = inject<PeraModalRef<boolean>>(PeraModalRef);
  readonly data = inject<LedgerAllocateData>(PERA_MODAL_DATA);

  readonly saving = signal(false);
  readonly alert = signal<string | null>(null);
  readonly invoicesById = signal<Record<string, InvoiceResponse>>({});

  readonly options = computed<SelectOption[]>(() =>
    Object.values(this.invoicesById()).map((i) => ({
      value: i.id,
      label: `${i.number} · ${i.balance} outstanding`,
    })),
  );

  readonly form = this.fb.group({
    invoiceId: ['', [Validators.required]],
    amount: [
      '',
      [
        Validators.required,
        moneyPositiveValidator(1),
        moneyDecimalsValidator(4),
        moneyMaxValidator(() => this.computeMax()),
      ],
    ],
  });

  readonly picked = computed<InvoiceResponse | null>(() => {
    const id = this.form.controls.invoiceId.value;
    return id ? (this.invoicesById()[id] ?? null) : null;
  });

  readonly maxAmount = computed<string>(() => this.computeMax());
  readonly hintText = computed<string>(
    () => `Max: ${this.maxAmount()} (lesser of unallocated and invoice balance).`,
  );

  private computeMax(): string {
    const inv = this.picked();
    if (!inv) return this.data.unallocated;
    return Number(inv.balance) < Number(this.data.unallocated)
      ? inv.balance
      : this.data.unallocated;
  }

  ngOnInit(): void {
    this.invoices.getOutstanding(this.data.projectId).subscribe((list) => {
      this.invoicesById.set(Object.fromEntries(list.map((i) => [i.id, i])));
    });
  }

  cancel(): void {
    this.ref.close(false);
  }

  submit(): void {
    if (this.form.invalid || this.saving()) return;
    this.saving.set(true);
    this.alert.set(null);
    const raw = this.form.getRawValue();
    this.ledger
      .allocate(this.data.entryId, { invoiceId: raw.invoiceId!, amount: raw.amount! })
      .subscribe({
        next: () => {
          this.toast.show({ tone: 'success', message: 'Payment allocated' });
          this.ref.close(true);
        },
        error: (err: HttpErrorResponse) => {
          this.saving.set(false);
          applyFinanceServerError(
            this.form,
            this.errors.parse(err),
            {
              'ledgerEntries.OverAllocation': 'amount',
              'invoices.NotFound': 'invoiceId',
            },
            this.alert,
          );
        },
      });
  }
}

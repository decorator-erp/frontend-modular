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
import { ActivatedRoute, Router } from '@angular/router';
import { combineLatest, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { BudgetLineService, budgetLineLabel } from '../../data/budget-line.service';
import { LedgerEntryService } from '../../data/ledger-entry.service';
import { ProjectStageService } from '@modules/projects';
import { ClientSearchService } from '@modules/clients';
import { ErrorHandlerService } from '@platform/http/error-handler.service';
import { ToastService } from '@platform/feedback/toast.service';
import {
  LedgerDirectionValues,
  LedgerEntryTypeValues,
  PaymentMethodValues,
} from '../../model/enums';
import type { LedgerDirection, LedgerEntryType } from '../../model/enums';
import {
  clientPaymentDirectionValidator,
  clientPaymentLinkValidator,
  commitmentBudgetValidator,
  moneyDecimalsValidator,
  moneyPositiveValidator,
  referenceUuidValidator,
} from '../../model/validation/validators.finance';
import { applyFinanceServerError } from '../../model/validation/finance-error-mapping';
import {
  PeraAlertComponent,
  PeraButtonComponent,
  PeraDateInputComponent,
  PeraFormFieldComponent,
  PeraInputComponent,
  PeraMoneyInputComponent,
  PeraSelectComponent,
  PeraTextareaComponent,
  SelectOption,
} from '@ds';

type LedgerType = LedgerEntryType;

const TYPE_CARDS: { value: LedgerType; label: string; hint: string }[] = [
  { value: 'Commitment', label: 'Commitment', hint: 'Reserve budget for a future payment.' },
  { value: 'ActualCost', label: 'Actual cost', hint: 'Record an outgoing payment posted.' },
  { value: 'ClientPayment', label: 'Client payment', hint: 'Incoming funds from a client.' },
];

/**
 * LedgerEntry post page — single-page form per `FEATURE_PROMPT_FINANCE_PAGES.md`
 * §F-LE. Type-conditional fields, idempotent `reference`, available-budget
 * preview when a line is picked, friendly error mapping for `InsufficientBudget`
 * / `DuplicatePosting` / `InvalidDirection`.
 */
@Component({
  selector: 'app-ledger-post',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    PeraAlertComponent,
    PeraButtonComponent,
    PeraDateInputComponent,
    PeraFormFieldComponent,
    PeraInputComponent,
    PeraMoneyInputComponent,
    PeraSelectComponent,
    PeraTextareaComponent,
  ],
  template: `
    <div class="px-8 py-6 max-w-[var(--w-form)] mx-auto">
      <header class="mb-5">
        <div class="font-mono fs-label uppercase text-text-muted tracking-[0.04em] mb-1">
          FINANCE · POST LEDGER ENTRY
        </div>
        <h1 class="m-0 fs-h2 font-semibold">Post a money movement</h1>
        <p class="m-0 mt-1 fs-caption text-text-secondary">
          The ledger is append-only. Mistakes are corrected with a reversal — pick the type
          carefully.
        </p>
      </header>

      @if (alert(); as a) {
        <pera-alert tone="danger" class="block mb-4">{{ a }}</pera-alert>
      }

      <form
        [formGroup]="form"
        (ngSubmit)="submit()"
        class="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_var(--w-rail)] gap-5"
      >
        <!-- LEFT: form -->
        <div class="flex flex-col gap-5">
          <!-- Movement section: type cards -->
          <section class="border border-border bg-surface rounded-card p-5">
            <h3 class="m-0 mb-3 fs-body-sm font-semibold">1. Movement</h3>
            <div class="grid grid-cols-1 md:grid-cols-3 gap-2.5">
              @for (c of typeCards; track c.value) {
                <button
                  type="button"
                  class="text-left p-3 border bg-bg cursor-pointer hover:border-text-primary"
                  [class.border-text-primary]="form.value.type === c.value"
                  [class.border-border]="form.value.type !== c.value"
                  (click)="pickType(c.value)"
                >
                  <div class="font-mono fs-label uppercase text-text-muted mb-1">
                    {{ c.value }}
                  </div>
                  <div class="fs-body-sm font-medium">{{ c.label }}</div>
                  <div class="fs-label text-text-secondary mt-1">{{ c.hint }}</div>
                </button>
              }
            </div>
          </section>

          @if (form.value.type) {
            <section class="border border-border bg-surface rounded-card p-5 flex flex-col gap-3">
              <h3 class="m-0 fs-body-sm font-semibold">2. Details</h3>

              <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                <pera-form-field label="Amount" [required]="true">
                  <pera-money-input formControlName="amount" />
                </pera-form-field>
                <pera-form-field label="Direction" [required]="true">
                  <pera-select formControlName="direction" [options]="directionOptions" />
                </pera-form-field>
              </div>

              <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                <pera-form-field label="Occurred on" [required]="true">
                  <pera-date-input formControlName="occurredOn" />
                </pera-form-field>
                <pera-form-field label="Payment method">
                  <pera-select
                    formControlName="method"
                    [options]="methodOptions"
                    placeholder="Optional"
                  />
                </pera-form-field>
              </div>

              @if (form.value.type === 'Commitment' || form.value.type === 'ActualCost') {
                <pera-form-field label="Budget line" [required]="true">
                  <pera-select
                    formControlName="budgetLineId"
                    [options]="budgetLines()"
                    placeholder="Pick a line"
                  />
                </pera-form-field>
                <pera-form-field label="Vendor (optional)">
                  <pera-input formControlName="vendorName" placeholder="Supplier name" />
                </pera-form-field>
              }

              @if (form.value.type === 'ClientPayment') {
                <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <pera-form-field label="Client" [required]="true">
                    <pera-select
                      formControlName="clientId"
                      [options]="clients()"
                      placeholder="Pick a client"
                    />
                  </pera-form-field>
                  <pera-form-field label="Stage" [required]="true">
                    <pera-select
                      formControlName="projectStageId"
                      [options]="stages()"
                      placeholder="Pick a stage"
                    />
                  </pera-form-field>
                </div>
              }

              <pera-form-field
                label="Reference (idempotency)"
                hint="Auto-generated UUID. Retries with the same reference are rejected by the server as DuplicatePosting."
              >
                <div class="flex items-center gap-2">
                  <pera-input formControlName="reference" class="flex-1" />
                  <button
                    type="button"
                    class="font-mono fs-label uppercase border border-border px-2 py-1 cursor-pointer hover:bg-surface-muted"
                    (click)="regenerateReference()"
                  >
                    Regenerate
                  </button>
                </div>
              </pera-form-field>

              <pera-form-field label="Note">
                <pera-textarea formControlName="note" [rows]="2" />
              </pera-form-field>
            </section>

            <div class="flex justify-end gap-2">
              <pera-button type="button" variant="ghost" (click)="cancel()">Cancel</pera-button>
              <pera-button type="submit" variant="primary" [disabled]="form.invalid || saving()">
                {{ saving() ? 'Posting…' : 'Post entry' }}
              </pera-button>
            </div>
          }
        </div>

        <!-- RIGHT: live summary -->
        <aside class="flex flex-col gap-3">
          <section class="border border-border bg-surface rounded-card p-4">
            <h4 class="m-0 mb-2 font-mono fs-label uppercase text-text-muted">Summary</h4>
            <dl class="m-0 grid grid-cols-[auto_1fr] gap-x-3 gap-y-2 fs-caption">
              <dt class="text-text-muted">Type</dt>
              <dd class="m-0">{{ form.value.type || '—' }}</dd>
              <dt class="text-text-muted">Direction</dt>
              <dd class="m-0">{{ form.value.direction || '—' }}</dd>
              <dt class="text-text-muted">Amount</dt>
              <dd class="m-0 tabular-nums">{{ form.value.amount || '—' }}</dd>
            </dl>
          </section>
          @if (pickedLine(); as l) {
            <section class="border border-border bg-surface rounded-card p-4">
              <h4 class="m-0 mb-2 font-mono fs-label uppercase text-text-muted">Budget line</h4>
              <div class="fs-caption font-medium">{{ l.name }}</div>
              <div class="fs-label text-text-muted mb-2">{{ l.costCategoryName }}</div>
              <dl class="m-0 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 fs-caption">
                <dt class="text-text-muted">Available</dt>
                <dd
                  class="m-0 tabular-nums"
                  [class.text-success]="canCover()"
                  [class.text-danger]="!canCover() && form.value.amount"
                >
                  {{ l.availableAmount }}
                </dd>
                <dt class="text-text-muted">Committed</dt>
                <dd class="m-0 tabular-nums">{{ l.committedAmount }}</dd>
                <dt class="text-text-muted">Actual</dt>
                <dd class="m-0 tabular-nums">{{ l.actualAmount }}</dd>
              </dl>
            </section>
          }
        </aside>
      </form>
    </div>
  `,
})
export class LedgerPostComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly ledger = inject(LedgerEntryService);
  private readonly budgets = inject(BudgetLineService);
  private readonly stagesApi = inject(ProjectStageService);
  private readonly clientSearch = inject(ClientSearchService);
  private readonly errors = inject(ErrorHandlerService);
  private readonly toast = inject(ToastService);

  readonly typeCards = TYPE_CARDS;
  readonly directionOptions: SelectOption[] = LedgerDirectionValues.map((v) => ({
    value: v,
    label: v === 'In' ? 'In (incoming)' : 'Out (outgoing)',
  }));
  readonly methodOptions: SelectOption[] = PaymentMethodValues.map((v) => ({ value: v, label: v }));

  readonly projectId = signal('');
  readonly saving = signal(false);
  readonly alert = signal<string | null>(null);
  readonly budgetLines = signal<SelectOption[]>([]);
  readonly stages = signal<SelectOption[]>([]);
  readonly clients = signal<SelectOption[]>([]);
  readonly linesById = signal<
    Record<
      string,
      {
        name: string;
        costCategoryName: string;
        availableAmount: string;
        committedAmount: string;
        actualAmount: string;
      }
    >
  >({});

  readonly form = this.fb.group(
    {
      type: this.fb.control<LedgerType | ''>('', [Validators.required]),
      direction: this.fb.control<LedgerDirection | ''>('', [Validators.required]),
      amount: ['', [Validators.required, moneyPositiveValidator(1), moneyDecimalsValidator(4)]],
      occurredOn: [new Date().toISOString().slice(0, 10), [Validators.required]],
      method: [''],
      budgetLineId: [''],
      vendorName: [''],
      clientId: [''],
      projectStageId: [''],
      reference: ['', [referenceUuidValidator]],
      note: [''],
    },
    {
      validators: [
        clientPaymentDirectionValidator,
        commitmentBudgetValidator,
        clientPaymentLinkValidator,
      ],
    },
  );

  readonly pickedLine = computed(() => {
    const id = this.form.controls.budgetLineId.value;
    return id ? (this.linesById()[id] ?? null) : null;
  });

  readonly canCover = computed(() => {
    const line = this.pickedLine();
    const amt = this.form.controls.amount.value;
    if (!line || !amt) return true;
    return Number(line.availableAmount) >= Number(amt);
  });

  ngOnInit(): void {
    this.projectId.set(this.route.snapshot.paramMap.get('projectId') ?? '');
    this.form.controls.reference.setValue(this.ledger.newIdempotencyReference());
    if (LedgerEntryTypeValues.length === 0) return;

    combineLatest([
      this.budgets.getByProject(this.projectId()).pipe(catchError(() => of([]))),
      this.stagesApi.getByProject(this.projectId()).pipe(catchError(() => of([]))),
      this.clientSearch
        .search({ pageSize: 200, isActive: true })
        .pipe(catchError(() => of({ items: [], totalCount: 0, pageIndex: 1, totalPages: 1 }))),
    ]).subscribe(([lines, stages, clients]) => {
      this.budgetLines.set(lines.map((l) => ({ value: l.id, label: budgetLineLabel(l) })));
      this.linesById.set(
        Object.fromEntries(
          lines.map((l) => [
            l.id,
            {
              name: l.name,
              costCategoryName: l.costCategoryName,
              availableAmount: l.availableAmount,
              committedAmount: l.committedAmount,
              actualAmount: l.actualAmount,
            },
          ]),
        ),
      );
      this.stages.set(stages.map((s) => ({ value: s.id, label: s.name })));
      this.clients.set(
        clients.items.map((c) => ({
          value: c.id,
          label: [c.firstName, c.lastName].filter(Boolean).join(' ') || c.email,
        })),
      );
    });
  }

  pickType(t: LedgerType): void {
    this.form.patchValue({ type: t });
    if (t === 'ClientPayment') {
      this.form.patchValue({ direction: 'In' });
      this.form.controls.direction.disable();
      this.form.controls.budgetLineId.setValue('');
    } else {
      this.form.controls.direction.enable();
      if (!this.form.controls.direction.value) this.form.patchValue({ direction: 'Out' });
      this.form.controls.clientId.setValue('');
      this.form.controls.projectStageId.setValue('');
    }
  }

  regenerateReference(): void {
    this.form.controls.reference.setValue(this.ledger.newIdempotencyReference());
  }

  cancel(): void {
    void this.router.navigate(['/finance/projects', this.projectId(), 'ledger']);
  }

  submit(): void {
    if (this.form.invalid || this.saving()) return;
    this.saving.set(true);
    this.alert.set(null);
    const raw = this.form.getRawValue();
    this.ledger
      .postEntry({
        projectId: this.projectId(),
        type: raw.type as LedgerType,
        direction: raw.direction as LedgerDirection,
        amount: raw.amount!,
        occurredOn: raw.occurredOn!,
        method: (raw.method as never) || null,
        budgetLineId: raw.budgetLineId || null,
        vendorName: raw.vendorName?.trim() || null,
        clientId: raw.clientId || null,
        projectStageId: raw.projectStageId || null,
        reference: raw.reference || null,
        note: raw.note?.trim() || null,
      })
      .subscribe({
        next: () => {
          this.toast.show({ tone: 'success', message: 'Ledger entry posted' });
          void this.router.navigate(['/finance/projects', this.projectId(), 'ledger']);
        },
        error: (err: HttpErrorResponse) => {
          this.saving.set(false);
          applyFinanceServerError(
            this.form,
            this.errors.parse(err),
            {
              'ledgerEntries.InsufficientBudget': 'amount',
              'ledgerEntries.DuplicatePosting': 'reference',
              'ledgerEntries.InvalidDirection': 'direction',
              'budgetLines.NotFound': 'budgetLineId',
            },
            this.alert,
          );
        },
      });
  }
}

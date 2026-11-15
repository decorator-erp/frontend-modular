import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { FormArray, FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { combineLatest, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { BudgetLineService, budgetLineLabel } from '../../data/budget-line.service';
import { InvoiceService } from '../../data/invoice.service';
import { ProjectStageService } from '@modules/projects';
import { ProjectTaskService } from '@modules/projects';
import { ClientSearchService } from '@modules/clients';
import { ErrorHandlerService } from '@platform/http/error-handler.service';
import { ToastService } from '@platform/feedback/toast.service';
import { InvoiceTypeValues } from '../../model/enums';
import type { InvoiceType } from '../../model/enums';
import {
  dateAfterValidator,
  invoicePartyValidator,
  moneyDecimalsValidator,
  moneyPositiveValidator,
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

/** Invoice create form — full page with FormArray of lines, sticky footer total. §F-INV. */
@Component({
  selector: 'app-invoice-form',
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
  // RS-1: below md each invoice line is a stacked card (labels from data-label); the table
  // returns from md up. Display-only — the FormArray and its controls are unchanged.
  styles: [
    `
      @media (max-width: 47.9375rem) {
        .inv-lines,
        .inv-lines tbody,
        .inv-lines tr,
        .inv-lines td {
          display: block;
          width: 100%;
        }
        .inv-lines thead {
          display: none;
        }
        .inv-lines tr {
          display: grid;
          grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
          gap: var(--space-2) var(--space-3);
          padding: var(--space-3);
        }
        .inv-lines td {
          padding: 0;
          text-align: start;
        }
        .inv-lines td[data-label]::before {
          content: attr(data-label);
          display: block;
          margin-bottom: var(--space-1);
          font-family: var(--font-mono);
          font-size: var(--fs-micro);
          text-transform: uppercase;
          color: var(--color-text-muted);
        }
        .inv-lines td.inv-wide {
          grid-column: 1 / -1;
        }
      }
    `,
  ],
  template: `
    <div class="px-4 md:px-6 lg:px-8 pt-6 max-w-[var(--w-page)] mx-auto">
      <header class="mb-5">
        <div class="font-mono fs-label uppercase text-text-muted tracking-[0.04em] mb-1">
          FINANCE · NEW INVOICE
        </div>
        <h1 class="m-0 fs-h2 font-semibold">Create invoice</h1>
      </header>

      @if (alert(); as a) {
        <pera-alert tone="danger" class="block mb-4">{{ a }}</pera-alert>
      }

      <form [formGroup]="form" (ngSubmit)="submit()" class="flex flex-col gap-5">
        <!-- HEADER section -->
        <section
          class="border border-border bg-surface rounded-card p-5 grid grid-cols-1 md:grid-cols-2 gap-3"
        >
          <pera-form-field label="Type" [required]="true">
            <div class="flex gap-2">
              @for (t of types; track t) {
                <button
                  type="button"
                  class="flex-1 px-3 py-2 border bg-bg cursor-pointer fs-caption"
                  [class.border-text-primary]="form.value.type === t"
                  [class.border-border]="form.value.type !== t"
                  (click)="pickType(t)"
                >
                  {{ t }}
                </button>
              }
            </div>
          </pera-form-field>
          <pera-form-field label="Number" [required]="true">
            <pera-input formControlName="number" placeholder="INV-2026-001" />
          </pera-form-field>

          @if (form.value.type === 'ClientInvoice') {
            <pera-form-field label="Client" [required]="true">
              <pera-select
                formControlName="clientId"
                [options]="clients()"
                placeholder="Pick a client"
              />
            </pera-form-field>
          } @else if (form.value.type === 'VendorInvoice') {
            <pera-form-field label="Vendor name" [required]="true">
              <pera-input formControlName="vendorName" placeholder="Supplier Co." />
            </pera-form-field>
          }

          <pera-form-field label="Stage (optional)">
            <pera-select
              formControlName="projectStageId"
              [options]="stages()"
              placeholder="No stage"
            />
          </pera-form-field>

          <pera-form-field label="Issued on" [required]="true">
            <pera-date-input formControlName="issuedOn" />
          </pera-form-field>
          <pera-form-field label="Due on">
            <pera-date-input formControlName="dueOn" />
          </pera-form-field>

          <pera-form-field label="Note" class="md:col-span-2">
            <pera-textarea formControlName="note" [rows]="2" />
          </pera-form-field>
        </section>

        <!-- LINES section -->
        <section class="border border-border bg-surface rounded-card" formArrayName="lines">
          <header class="px-5 py-3 border-b border-border flex items-center justify-between">
            <h3 class="m-0 fs-body-sm font-semibold">Lines</h3>
            <pera-button type="button" variant="secondary" iconStart="plus" (click)="addLine()"
              >Add line</pera-button
            >
          </header>
          @if (linesArray.controls.length === 0) {
            <p class="m-0 p-5 fs-caption text-text-muted text-center">
              Add the first line to start.
            </p>
          } @else {
            <table class="inv-lines w-full border-collapse">
              <thead>
                <tr
                  class="text-left font-mono fs-micro uppercase tracking-[0.04em] text-text-muted"
                >
                  <th class="p-2 font-medium">Description</th>
                  <th class="p-2 font-medium w-[var(--w-column-sm)]">Unit</th>
                  <th class="p-2 font-medium w-[var(--w-column-sm)]">Qty</th>
                  <th class="p-2 font-medium w-[var(--w-column)]">Unit price</th>
                  <th class="p-2 font-medium w-[var(--w-column)] text-right">Line total</th>
                  <th class="p-2 font-medium w-[var(--w-node)]">Task</th>
                  <th class="p-2 font-medium w-[var(--w-node)]">Budget line</th>
                  <th class="p-2 w-[var(--space-10)]"></th>
                </tr>
              </thead>
              <tbody>
                @for (line of linesArray.controls; track $index; let i = $index) {
                  <tr [formGroupName]="i" class="border-t border-border-soft align-top">
                    <td class="p-2 inv-wide" data-label="Description">
                      <pera-input formControlName="description" placeholder="Item description" />
                    </td>
                    <td class="p-2" data-label="Unit">
                      <pera-input formControlName="unit" placeholder="ea" />
                    </td>
                    <td class="p-2" data-label="Qty">
                      <pera-input formControlName="quantity" placeholder="1" />
                    </td>
                    <td class="p-2" data-label="Unit price">
                      <pera-money-input formControlName="unitPrice" />
                    </td>
                    <td class="p-2 text-right tabular-nums font-medium" data-label="Line total">
                      {{ lineTotal(i) }}
                    </td>
                    <td class="p-2" data-label="Task">
                      <pera-select
                        formControlName="projectTaskId"
                        [options]="taskOptions()"
                        placeholder="—"
                      />
                    </td>
                    <td class="p-2" data-label="Budget line">
                      <pera-select
                        formControlName="budgetLineId"
                        [options]="budgetOptions()"
                        placeholder="—"
                      />
                    </td>
                    <td class="p-2 text-center inv-wide">
                      <button
                        type="button"
                        class="font-mono fs-label uppercase text-danger hover:underline"
                        (click)="removeLine(i)"
                      >
                        ×
                      </button>
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          }
        </section>
      </form>

      <!-- Sticky footer total. RS-1: sticky inside the page (was fixed to the viewport, which
           sat over the sidebar and the phone tab bar) and wrapping. -->
      <div
        class="sticky bottom-0 mt-5 -mx-4 md:-mx-6 lg:-mx-8 bg-surface border-t border-border px-4 md:px-6 lg:px-8 py-3 flex flex-wrap items-center justify-end gap-x-4 gap-y-2 z-10"
      >
        <div class="font-mono fs-label uppercase text-text-muted">Total</div>
        <div class="fs-h3 font-semibold tabular-nums">{{ total() }}</div>
        <pera-button type="button" variant="ghost" (click)="cancel()">Cancel</pera-button>
        <pera-button
          type="submit"
          variant="primary"
          [disabled]="form.invalid || saving()"
          (click)="submit()"
        >
          {{ saving() ? 'Creating…' : 'Create invoice' }}
        </pera-button>
      </div>
    </div>
  `,
})
export class InvoiceFormComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly api = inject(InvoiceService);
  private readonly stagesApi = inject(ProjectStageService);
  private readonly tasksApi = inject(ProjectTaskService);
  private readonly budgets = inject(BudgetLineService);
  private readonly clientSearch = inject(ClientSearchService);
  private readonly errors = inject(ErrorHandlerService);
  private readonly toast = inject(ToastService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  readonly types = InvoiceTypeValues;
  readonly projectId = signal('');
  readonly saving = signal(false);
  readonly alert = signal<string | null>(null);
  readonly stages = signal<SelectOption[]>([{ value: '', label: 'No stage' }]);
  readonly clients = signal<SelectOption[]>([]);
  readonly taskOptions = signal<SelectOption[]>([{ value: '', label: '—' }]);
  readonly budgetOptions = signal<SelectOption[]>([{ value: '', label: '—' }]);

  readonly form = this.fb.group(
    {
      type: this.fb.control<InvoiceType | ''>('', [Validators.required]),
      number: ['', [Validators.required, Validators.maxLength(64)]],
      clientId: [''],
      vendorName: [''],
      projectStageId: [''],
      issuedOn: [new Date().toISOString().slice(0, 10), [Validators.required]],
      dueOn: [''],
      note: ['', [Validators.maxLength(1024)]],
      lines: this.fb.array<FormGroup>([], [Validators.minLength(1)]),
    },
    { validators: [invoicePartyValidator] },
  );

  get linesArray(): FormArray<FormGroup> {
    return this.form.controls.lines;
  }

  /** Plain method — runs every change-detection tick. computed() can't subscribe to a FormGroup so we don't try. */
  total(): string {
    let sum = 0;
    for (const g of this.linesArray.controls) {
      const q = Number(g.get('quantity')?.value) || 0;
      const p = Number(g.get('unitPrice')?.value) || 0;
      sum += q * p;
    }
    return sum.toFixed(2);
  }

  ngOnInit(): void {
    this.projectId.set(this.route.snapshot.paramMap.get('projectId') ?? '');
    if (this.form.controls.dueOn) {
      this.form.controls.dueOn.addValidators(dateAfterValidator(this.form.controls.issuedOn));
    }
    this.addLine(); // start with one blank row

    combineLatest([
      this.stagesApi.getByProject(this.projectId()).pipe(catchError(() => of([]))),
      this.budgets.getByProject(this.projectId()).pipe(catchError(() => of([]))),
      this.tasksApi.getByProject(this.projectId()).pipe(catchError(() => of([]))),
      this.clientSearch.search({ pageSize: 200, isActive: true }).pipe(
        catchError(() =>
          of({
            items: [] as { id: string; firstName: string; lastName: string; email: string }[],
          }),
        ),
      ),
    ]).subscribe(([stages, bl, tasks, clientsPage]) => {
      this.stages.set([
        { value: '', label: 'No stage' },
        ...stages.map((s) => ({ value: s.id, label: s.name })),
      ]);
      this.budgetOptions.set([
        { value: '', label: '—' },
        ...bl.map((l) => ({ value: l.id, label: budgetLineLabel(l) })),
      ]);
      this.taskOptions.set([
        { value: '', label: '—' },
        ...tasks.map((t) => ({ value: t.id, label: t.name })),
      ]);
      this.clients.set(
        clientsPage.items.map((c) => ({
          value: c.id,
          label: [c.firstName, c.lastName].filter(Boolean).join(' ') || c.email,
        })),
      );
    });
  }

  pickType(t: InvoiceType): void {
    this.form.patchValue({ type: t });
    if (t === 'ClientInvoice') this.form.controls.vendorName.setValue('');
    else this.form.controls.clientId.setValue('');
  }

  lineTotal(i: number): string {
    const g = this.linesArray.at(i);
    const q = Number(g.get('quantity')?.value) || 0;
    const p = Number(g.get('unitPrice')?.value) || 0;
    return (q * p).toFixed(2);
  }

  addLine(): void {
    this.linesArray.push(
      this.fb.group({
        description: ['', [Validators.required, Validators.maxLength(512)]],
        unit: [''],
        quantity: [
          '1',
          [Validators.required, moneyPositiveValidator(1), moneyDecimalsValidator(4)],
        ],
        unitPrice: [
          '0',
          [Validators.required, moneyPositiveValidator(0), moneyDecimalsValidator(4)],
        ],
        projectTaskId: [''],
        budgetLineId: [''],
      }),
    );
  }

  removeLine(i: number): void {
    if (this.linesArray.length === 1) return;
    this.linesArray.removeAt(i);
  }

  cancel(): void {
    void this.router.navigate(['/finance/projects', this.projectId(), 'invoices']);
  }

  submit(): void {
    if (this.form.invalid || this.saving()) return;
    this.saving.set(true);
    this.alert.set(null);
    const raw = this.form.getRawValue();
    this.api
      .create({
        projectId: this.projectId(),
        type: raw.type as InvoiceType,
        number: raw.number!.trim(),
        clientId: raw.clientId || null,
        vendorName: raw.vendorName?.trim() || null,
        projectStageId: raw.projectStageId || null,
        issuedOn: raw.issuedOn!,
        dueOn: raw.dueOn || null,
        note: raw.note?.trim() || null,
        lines: raw.lines!.map((l) => ({
          description: String(l['description'] ?? '').trim(),
          unit: (l['unit'] ?? '').toString().trim() || null,
          quantity: String(l['quantity'] ?? ''),
          unitPrice: String(l['unitPrice'] ?? ''),
          projectTaskId: l['projectTaskId'] || null,
          budgetLineId: l['budgetLineId'] || null,
        })),
      })
      .subscribe({
        next: (id) => {
          this.toast.show({ tone: 'success', message: 'Invoice created' });
          void this.router.navigate(['/finance/projects', this.projectId(), 'invoices', id]);
        },
        error: (err: HttpErrorResponse) => {
          this.saving.set(false);
          applyFinanceServerError(
            this.form,
            this.errors.parse(err),
            {
              'invoices.DuplicateNumber': 'number',
              'invoices.MissingParty': 'clientId',
            },
            this.alert,
          );
        },
      });
  }
}

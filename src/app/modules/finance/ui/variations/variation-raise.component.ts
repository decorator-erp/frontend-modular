import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { FormBuilder, ReactiveFormsModule, Validators, FormsModule } from '@angular/forms';
import { combineLatest, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { BudgetLineService } from '../../data/budget-line.service';
import { ProjectTaskService } from '@modules/projects';
import { VariationService } from '../../data/variation.service';
import { ErrorHandlerService } from '@platform/http/error-handler.service';
import { ToastService } from '@platform/feedback/toast.service';
import { VariationKindValues } from '../../model/enums';
import type { VariationKind } from '../../model/enums';
import {
  clientDifferenceValidator,
  internalChangeValidator,
  moneyDecimalsValidator,
  moneyPositiveValidator,
  variationAmountConsistencyValidator,
} from '../../model/validation/validators.finance';
import { applyFinanceServerError } from '../../model/validation/finance-error-mapping';
import {
  PERA_MODAL_DATA,
  PeraAlertComponent,
  PeraButtonComponent,
  PeraFormFieldComponent,
  PeraInputComponent,
  PeraModalRef,
  PeraMoneyInputComponent,
  PeraRadioComponent,
  PeraSelectComponent,
  PeraTextareaComponent,
  RadioOption,
  SelectOption,
} from '@ds';

export interface VariationRaiseData {
  projectId: string;
}

/** Raise a variation modal — §F-VAR.3. */
@Component({
  selector: 'app-variation-raise',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    FormsModule,
    PeraAlertComponent,
    PeraButtonComponent,
    PeraFormFieldComponent,
    PeraInputComponent,
    PeraMoneyInputComponent,
    PeraRadioComponent,
    PeraSelectComponent,
    PeraTextareaComponent,
  ],
  template: `
    <form
      [formGroup]="form"
      (ngSubmit)="submit()"
      class="flex flex-col gap-4 p-5 min-w-[var(--w-dialog-lg)] bg-surface border border-border"
    >
      <h2 class="m-0 fs-body font-semibold">Raise variation</h2>
      @if (alert(); as a) {
        <pera-alert tone="danger">{{ a }}</pera-alert>
      }

      <pera-form-field label="Kind" [required]="true">
        <pera-radio
          [options]="kindOptions"
          [ngModel]="form.value.kind"
          [ngModelOptions]="{ standalone: true }"
          (ngModelChange)="pickKind($event)"
        />
      </pera-form-field>

      <pera-form-field label="Reason" [required]="true">
        <pera-input formControlName="reason" placeholder="Short summary" />
      </pera-form-field>

      <pera-form-field label="Description">
        <pera-textarea formControlName="description" [rows]="3" />
      </pera-form-field>

      @if (form.value.kind === 'ClientDifference') {
        <pera-form-field label="Task" [required]="true">
          <pera-select
            formControlName="projectTaskId"
            [options]="tasks()"
            placeholder="Pick a task"
          />
        </pera-form-field>
        <div class="grid grid-cols-2 gap-3">
          <pera-form-field label="Budgeted amount" [required]="true">
            <pera-money-input formControlName="budgetedAmount" />
          </pera-form-field>
          <pera-form-field label="Chosen amount" [required]="true">
            <pera-money-input formControlName="chosenAmount" />
          </pera-form-field>
        </div>
        <p class="m-0 fs-label text-text-muted">
          Amount auto-fills to (chosen &minus; budgeted). Edit only if the rule diverges.
        </p>
      } @else if (form.value.kind === 'InternalChange') {
        <pera-form-field label="Budget line" [required]="true">
          <pera-select
            formControlName="budgetLineId"
            [options]="budgetLines()"
            placeholder="Pick a line"
          />
        </pera-form-field>
      }

      <pera-form-field label="Amount" [required]="true">
        <pera-money-input formControlName="amount" />
      </pera-form-field>

      <div class="flex justify-end gap-2 pt-1">
        <pera-button type="button" variant="ghost" (click)="cancel()">Cancel</pera-button>
        <pera-button type="submit" variant="primary" [disabled]="form.invalid || saving()">
          {{ saving() ? 'Saving…' : 'Raise variation' }}
        </pera-button>
      </div>
    </form>
  `,
})
export class VariationRaiseComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly api = inject(VariationService);
  private readonly tasksApi = inject(ProjectTaskService);
  private readonly budgets = inject(BudgetLineService);
  private readonly errors = inject(ErrorHandlerService);
  private readonly toast = inject(ToastService);
  private readonly ref = inject<PeraModalRef<string | false>>(PeraModalRef);
  readonly data = inject<VariationRaiseData>(PERA_MODAL_DATA);

  readonly saving = signal(false);
  readonly alert = signal<string | null>(null);
  readonly tasks = signal<SelectOption[]>([]);
  readonly budgetLines = signal<SelectOption[]>([]);
  readonly kinds = VariationKindValues;
  readonly kindOptions: RadioOption[] = [
    {
      value: 'ClientDifference',
      label: 'Client difference',
      description: 'Client picked a different option than budgeted.',
    },
    {
      value: 'InternalChange',
      label: 'Internal change',
      description: 'Internal adjustment to an existing budget line.',
    },
  ];

  readonly form = this.fb.group(
    {
      kind: this.fb.control<VariationKind | ''>('', [Validators.required]),
      reason: ['', [Validators.required, Validators.maxLength(256)]],
      description: ['', [Validators.maxLength(2048)]],
      amount: ['', [Validators.required, moneyPositiveValidator(1), moneyDecimalsValidator(4)]],
      projectTaskId: [''],
      budgetedAmount: [''],
      chosenAmount: [''],
      budgetLineId: [''],
    },
    {
      validators: [
        clientDifferenceValidator,
        internalChangeValidator,
        variationAmountConsistencyValidator,
      ],
    },
  );

  ngOnInit(): void {
    combineLatest([
      this.tasksApi.getByProject(this.data.projectId).pipe(catchError(() => of([]))),
      this.budgets.getByProject(this.data.projectId).pipe(catchError(() => of([]))),
    ]).subscribe(([tasks, lines]) => {
      this.tasks.set(tasks.map((t) => ({ value: t.id, label: t.name })));
      this.budgetLines.set(
        lines.map((l) => ({ value: l.id, label: `${l.costCategoryName} — ${l.name}` })),
      );
    });

    // ClientDifference: auto-compute amount from chosen - budgeted
    this.form.valueChanges.subscribe(() => {
      if (this.form.value.kind === 'ClientDifference') {
        const b = Number(this.form.value.budgetedAmount);
        const c = Number(this.form.value.chosenAmount);
        if (!Number.isNaN(b) && !Number.isNaN(c)) {
          const diff = (c - b).toFixed(4).replace(/0+$/, '').replace(/\.$/, '');
          if (diff !== this.form.value.amount) {
            this.form.controls.amount.setValue(diff, { emitEvent: false });
          }
        }
      }
    });
  }

  pickKind(k: VariationKind): void {
    this.form.patchValue({
      kind: k,
      projectTaskId: '',
      budgetedAmount: '',
      chosenAmount: '',
      budgetLineId: '',
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
    this.api
      .raise({
        projectId: this.data.projectId,
        kind: raw.kind as VariationKind,
        reason: raw.reason!.trim(),
        description: raw.description?.trim() || null,
        amount: raw.amount!,
        projectTaskId: raw.projectTaskId || null,
        budgetedAmount: raw.budgetedAmount || null,
        chosenAmount: raw.chosenAmount || null,
        budgetLineId: raw.budgetLineId || null,
      })
      .subscribe({
        next: (id) => {
          this.toast.show({ tone: 'success', message: 'Variation raised (Draft)' });
          this.ref.close(id);
        },
        error: (err: HttpErrorResponse) => {
          this.saving.set(false);
          applyFinanceServerError(
            this.form,
            this.errors.parse(err),
            {
              'variations.AmountMismatch': 'amount',
              'projectTasks.NotFound': 'projectTaskId',
              'budgetLines.NotFound': 'budgetLineId',
            },
            this.alert,
          );
        },
      });
  }
}

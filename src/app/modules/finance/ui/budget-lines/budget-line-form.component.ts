import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { BudgetLineService } from '../../data/budget-line.service';
import { CostCategoryService } from '../../data/cost-category.service';
import { ProjectStageService } from '@modules/projects';
import { ErrorHandlerService } from '@platform/http/error-handler.service';
import { ToastService } from '@platform/feedback/toast.service';
import { BudgetLineResponse } from '../../model/budget-line.model';
import {
  moneyPositiveValidator,
  moneyDecimalsValidator,
  codePatternValidator,
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
  PeraSelectComponent,
  SelectOption,
} from '@ds';

export interface BudgetLineFormData {
  projectId: string;
  /** Pass to switch to update-allocation mode. */
  line?: BudgetLineResponse;
}

/**
 * Create budget line OR update its allocation. The update endpoint is
 * allocation-only per `api-docs/11-finance.md` §2, so in update mode only the
 * `allocatedAmount` field is editable; the rest renders as read-only context.
 */
@Component({
  selector: 'app-budget-line-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    PeraAlertComponent,
    PeraButtonComponent,
    PeraFormFieldComponent,
    PeraInputComponent,
    PeraMoneyInputComponent,
    PeraSelectComponent,
  ],
  template: `
    <form
      [formGroup]="form"
      (ngSubmit)="submit()"
      class="flex flex-col gap-4 p-5 w-[min(var(--w-dialog),92vw)] max-h-[85dvh] overflow-y-auto bg-surface border border-border rounded-card"
    >
      <h2 class="m-0 fs-body font-semibold">
        {{ isEdit() ? 'Edit budget line' : 'New budget line' }}
      </h2>

      @if (alert(); as a) {
        <pera-alert tone="danger">{{ a }}</pera-alert>
      }

      @if (!isEdit()) {
        <pera-form-field label="Cost category" [required]="true">
          <pera-select
            formControlName="costCategoryId"
            [options]="categories()"
            placeholder="Pick a category"
          />
        </pera-form-field>
        <pera-form-field label="Name" [required]="true">
          <pera-input formControlName="name" placeholder="Site labour Q1" />
        </pera-form-field>
        <pera-form-field
          label="Code"
          hint="Optional. Upper-case alphanumerics, dot, dash, underscore."
        >
          <pera-input formControlName="code" placeholder="LAB-Q1" />
        </pera-form-field>
        <pera-form-field label="Stage (optional)" hint="Leave blank for a project-level line.">
          <pera-select
            formControlName="projectStageId"
            [options]="stages()"
            placeholder="No stage"
          />
        </pera-form-field>
      } @else if (data.line; as l) {
        <dl
          class="m-0 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 fs-caption border border-border-soft p-3"
        >
          <dt class="font-mono fs-micro uppercase text-text-muted">Line</dt>
          <dd class="m-0">{{ l.name }}</dd>
          <dt class="font-mono fs-micro uppercase text-text-muted">Category</dt>
          <dd class="m-0">{{ l.costCategoryName }}</dd>
          <dt class="font-mono fs-micro uppercase text-text-muted">Committed</dt>
          <dd class="m-0 tabular-nums">{{ l.committedAmount }}</dd>
          <dt class="font-mono fs-micro uppercase text-text-muted">Actual</dt>
          <dd class="m-0 tabular-nums">{{ l.actualAmount }}</dd>
          <dt class="font-mono fs-micro uppercase text-text-muted">Available</dt>
          <dd class="m-0 tabular-nums">{{ l.availableAmount }}</dd>
        </dl>
      }

      <pera-form-field
        label="Allocated amount"
        [required]="true"
        hint="Must be &ge; 0. Decimal(19,4)."
      >
        <pera-money-input formControlName="allocatedAmount" />
      </pera-form-field>

      <div class="flex justify-end gap-2 pt-1">
        <pera-button type="button" variant="ghost" (click)="cancel()">Cancel</pera-button>
        <pera-button type="submit" variant="primary" [disabled]="form.invalid || saving()">
          {{ saving() ? 'Saving…' : isEdit() ? 'Save allocation' : 'Create line' }}
        </pera-button>
      </div>
    </form>
  `,
})
export class BudgetLineFormComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly api = inject(BudgetLineService);
  private readonly cats = inject(CostCategoryService);
  private readonly stagesApi = inject(ProjectStageService);
  private readonly errors = inject(ErrorHandlerService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);
  readonly data = inject<BudgetLineFormData>(PERA_MODAL_DATA);
  private readonly ref = inject<PeraModalRef<string | boolean>>(PeraModalRef);

  readonly isEdit = signal(false);
  readonly saving = signal(false);
  readonly alert = signal<string | null>(null);
  readonly categories = signal<SelectOption[]>([]);
  readonly stages = signal<SelectOption[]>([{ value: '', label: 'No stage' }]);

  readonly form = this.fb.group({
    costCategoryId: ['', [Validators.required]],
    name: ['', [Validators.required, Validators.maxLength(128)]],
    code: ['', [Validators.maxLength(32), codePatternValidator]],
    projectStageId: [''],
    allocatedAmount: [
      '0',
      [Validators.required, moneyPositiveValidator(0), moneyDecimalsValidator(4)],
    ],
  });

  ngOnInit(): void {
    if (this.data.line) {
      this.isEdit.set(true);
      this.form.patchValue({ allocatedAmount: this.data.line.allocatedAmount });
      this.form.get('costCategoryId')?.disable();
      this.form.get('name')?.disable();
      this.form.get('code')?.disable();
      this.form.get('projectStageId')?.disable();
    } else {
      this.cats
        .getAll({ pageSize: 200 })
        .subscribe((paged) =>
          this.categories.set(
            paged.items.map((c) => ({ value: c.id, label: `${c.code} · ${c.name}` })),
          ),
        );
      this.stagesApi
        .getByProject(this.data.projectId)
        .subscribe((list) =>
          this.stages.set([
            { value: '', label: 'No stage' },
            ...list.map((s) => ({ value: s.id, label: s.name })),
          ]),
        );
    }
  }

  cancel(): void {
    this.ref.close(false);
  }

  submit(): void {
    if (this.form.invalid || this.saving()) return;
    this.saving.set(true);
    this.alert.set(null);
    const raw = this.form.getRawValue();

    const call$ = this.isEdit()
      ? this.api.updateAllocation(this.data.line!.id, { allocatedAmount: raw.allocatedAmount! })
      : this.api.create({
          projectId: this.data.projectId,
          costCategoryId: raw.costCategoryId!,
          name: raw.name!.trim(),
          code: raw.code?.trim() || undefined,
          projectStageId: raw.projectStageId || null,
          allocatedAmount: raw.allocatedAmount!,
        });

    call$.subscribe({
      next: () => {
        this.saving.set(false);
        this.toast.show({
          tone: 'success',
          message: this.isEdit() ? 'Allocation updated' : 'Budget line created',
        });
        this.ref.close(true);
      },
      error: (err: HttpErrorResponse) => {
        this.saving.set(false);
        applyFinanceServerError(
          this.form,
          this.errors.parse(err),
          {
            'budgetLines.DuplicateCode': 'code',
            'costCategories.NotFound': 'costCategoryId',
          },
          this.alert,
        );
      },
    });
  }
}

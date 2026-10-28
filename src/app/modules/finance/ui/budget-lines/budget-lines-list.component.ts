import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  TemplateRef,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { BudgetLineService } from '../../data/budget-line.service';
import { BudgetLineResponse } from '../../model/budget-line.model';
import { CanDirective, PERM } from '@platform/permissions';
import { LocaleService } from '@platform/i18n';
import { MoneyService } from '@shared/ui/money.service';
import {
  ColumnDef,
  ModalService,
  PeraButtonComponent,
  PeraDataTableComponent,
  PeraPageHeaderComponent,
} from '@ds';
import { BudgetLineFormComponent, BudgetLineFormData } from './budget-line-form.component';

@Component({
  selector: 'app-budget-lines-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CanDirective, PeraButtonComponent, PeraDataTableComponent, PeraPageHeaderComponent],
  host: { class: 'block bg-bg min-h-full' },
  template: `
    <pera-page-header
      title="Budget editor"
      subtitle="Per-line allocations. Committed and actual amounts are derived from the ledger."
    >
      <div actions>
        <ng-container *peraCan="manageBudget">
          <pera-button variant="primary" iconStart="plus" (click)="openCreate()"
            >New line</pera-button
          >
        </ng-container>
      </div>
    </pera-page-header>
    <div class="px-8 py-6">
      <pera-data-table
        [columns]="columns()"
        [rows]="lines()"
        [loading]="loading()"
        [empty]="{
          title: 'No budget lines yet',
          description: 'Add your first allocation to start tracking commitments and actuals.',
        }"
        [hasRowClick]="true"
        (rowClick)="openEdit($event)"
      />
    </div>

    <ng-template #categoryCell let-row
      ><span class="fs-caption text-text-secondary">{{
        row.costCategoryName || '—'
      }}</span></ng-template
    >
    <ng-template #codeCell let-row>
      @if (row.code) {
        <span class="font-mono fs-label text-text-muted">{{ row.code }}</span>
      } @else {
        —
      }
    </ng-template>
    <ng-template #allocatedCell let-row
      ><span class="font-mono tabular-nums font-medium">{{
        money.format(row.allocatedAmount, 'EGP', locale.locale())
      }}</span></ng-template
    >
    <ng-template #committedCell let-row
      ><span class="font-mono tabular-nums text-text-secondary">{{
        money.format(row.committedAmount, 'EGP', locale.locale())
      }}</span></ng-template
    >
    <ng-template #actualCell let-row
      ><span class="font-mono tabular-nums text-text-secondary">{{
        money.format(row.actualAmount, 'EGP', locale.locale())
      }}</span></ng-template
    >
    <ng-template #availableCell let-row
      ><span
        class="font-mono tabular-nums font-medium"
        [class.text-success]="Number(row.availableAmount) > 0"
        [class.text-danger]="Number(row.availableAmount) < 0"
        >{{ money.format(row.availableAmount, 'EGP', locale.locale()) }}</span
      ></ng-template
    >
  `,
})
export class BudgetLinesListComponent implements OnInit {
  private readonly api = inject(BudgetLineService);
  private readonly route = inject(ActivatedRoute);
  private readonly modal = inject(ModalService);
  readonly money = inject(MoneyService);
  readonly locale = inject(LocaleService);

  readonly Number = Number;
  readonly manageBudget = PERM.finance.manageBudget;
  readonly projectId = signal('');
  readonly loading = signal(true);
  readonly lines = signal<BudgetLineResponse[]>([]);

  private readonly categoryTpl = viewChild<TemplateRef<unknown>>('categoryCell');
  private readonly codeTpl = viewChild<TemplateRef<unknown>>('codeCell');
  private readonly allocatedTpl = viewChild<TemplateRef<unknown>>('allocatedCell');
  private readonly committedTpl = viewChild<TemplateRef<unknown>>('committedCell');
  private readonly actualTpl = viewChild<TemplateRef<unknown>>('actualCell');
  private readonly availableTpl = viewChild<TemplateRef<unknown>>('availableCell');

  readonly columns = computed<ColumnDef<BudgetLineResponse>[]>(() => {
    const opt = (t: TemplateRef<unknown> | undefined) => (t ? { template: t } : {});
    return [
      { key: 'costCategoryName', header: 'Category', minWidth: 160, ...opt(this.categoryTpl()) },
      { key: 'name', header: 'Line', minWidth: 200 },
      { key: 'code', header: 'Code', width: 110, ...opt(this.codeTpl()) },
      { key: 'allocatedAmount', header: 'Allocated', width: 150, ...opt(this.allocatedTpl()) },
      { key: 'committedAmount', header: 'Committed', width: 140, ...opt(this.committedTpl()) },
      { key: 'actualAmount', header: 'Actual', width: 140, ...opt(this.actualTpl()) },
      { key: 'availableAmount', header: 'Available', width: 150, ...opt(this.availableTpl()) },
    ];
  });

  ngOnInit(): void {
    this.projectId.set(this.route.snapshot.paramMap.get('projectId') ?? '');
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.api.getByProject(this.projectId()).subscribe({
      next: (list) => {
        this.lines.set(list);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  async openCreate(): Promise<void> {
    const data: BudgetLineFormData = { projectId: this.projectId() };
    const created = await this.modal
      .open<boolean>(BudgetLineFormComponent, { size: 'md', data })
      .afterClosed();
    if (created) this.load();
  }

  async openEdit(line: BudgetLineResponse): Promise<void> {
    const data: BudgetLineFormData = { projectId: this.projectId(), line };
    const saved = await this.modal
      .open<boolean>(BudgetLineFormComponent, { size: 'md', data })
      .afterClosed();
    if (saved) this.load();
  }
}

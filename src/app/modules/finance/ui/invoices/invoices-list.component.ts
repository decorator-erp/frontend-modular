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
import { ActivatedRoute, Router } from '@angular/router';
import { InvoiceService } from '../../data/invoice.service';
import { InvoiceResponse } from '../../model/invoice.model';
import { CanDirective, PERM } from '@platform/permissions';
import * as InvoiceStatusEnum from '../../model/enums/invoice-status.enum';
import { LocaleService } from '@platform/i18n';
import { MoneyService } from '@shared/ui/money.service';
import {
  ColumnDef,
  PeraBadgeComponent,
  PeraButtonComponent,
  PeraDataTableComponent,
  PeraPageHeaderComponent,
} from '@ds';

@Component({
  selector: 'app-invoices-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CanDirective,
    PeraBadgeComponent,
    PeraButtonComponent,
    PeraDataTableComponent,
    PeraPageHeaderComponent,
  ],
  host: { class: 'block bg-bg min-h-full' },
  template: `
    <pera-page-header
      title="Invoices"
      subtitle="Client and vendor invoices. Payment is recorded as a ledger allocation."
    >
      <div actions>
        <ng-container *peraCan="manageInvoice">
          <pera-button variant="primary" iconStart="plus" (click)="goNew()"
            >New invoice</pera-button
          >
        </ng-container>
      </div>
    </pera-page-header>
    <div class="px-8 py-6">
      <pera-data-table
        [columns]="columns()"
        [rows]="invoices()"
        [loading]="loading()"
        [empty]="{
          title: 'No invoices yet',
          description: 'Issue the first client or vendor invoice.',
        }"
        [hasRowClick]="true"
        (rowClick)="open($event)"
      />
    </div>

    <ng-template #totalCell let-row
      ><span class="font-mono tabular-nums">{{
        money.format(row.totalAmount, 'EGP', locale.locale())
      }}</span></ng-template
    >
    <ng-template #paidCell let-row
      ><span class="font-mono tabular-nums text-success">{{
        money.format(row.paidAmount, 'EGP', locale.locale())
      }}</span></ng-template
    >
    <ng-template #balanceCell let-row
      ><span
        class="font-mono tabular-nums"
        [class.text-text-muted]="row.balance === '0' || row.balance === '0.0000'"
        >{{ money.format(row.balance, 'EGP', locale.locale()) }}</span
      ></ng-template
    >
    <ng-template #issuedCell let-row
      ><span class="font-mono fs-label">{{ shortDate(row.issuedOn) }}</span></ng-template
    >
    <ng-template #dueCell let-row
      ><span class="font-mono fs-label" [class.text-danger]="isOverdue(row)">{{
        row.dueOn ? shortDate(row.dueOn) : '—'
      }}</span></ng-template
    >
    <ng-template #statusCell let-row
      ><pera-badge [tone]="statusTone(row.status)">{{ row.status }}</pera-badge></ng-template
    >
    <ng-template #typeCell let-row
      ><span class="font-mono fs-label uppercase tracking-[0.04em] text-text-secondary">{{
        row.type === 'ClientInvoice' ? 'Client' : 'Vendor'
      }}</span></ng-template
    >
  `,
})
export class InvoicesListComponent implements OnInit {
  private readonly api = inject(InvoiceService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  readonly money = inject(MoneyService);
  readonly locale = inject(LocaleService);

  readonly manageInvoice = PERM.finance.manageInvoice;
  readonly projectId = signal('');
  readonly loading = signal(true);
  readonly invoices = signal<InvoiceResponse[]>([]);

  private readonly totalTpl = viewChild<TemplateRef<unknown>>('totalCell');
  private readonly paidTpl = viewChild<TemplateRef<unknown>>('paidCell');
  private readonly balanceTpl = viewChild<TemplateRef<unknown>>('balanceCell');
  private readonly issuedTpl = viewChild<TemplateRef<unknown>>('issuedCell');
  private readonly dueTpl = viewChild<TemplateRef<unknown>>('dueCell');
  private readonly statusTpl = viewChild<TemplateRef<unknown>>('statusCell');
  private readonly typeTpl = viewChild<TemplateRef<unknown>>('typeCell');

  readonly columns = computed<ColumnDef<InvoiceResponse>[]>(() => {
    const tot = this.totalTpl();
    const paid = this.paidTpl();
    const bal = this.balanceTpl();
    const iss = this.issuedTpl();
    const due = this.dueTpl();
    const st = this.statusTpl();
    const ty = this.typeTpl();
    const opt = (t: TemplateRef<unknown> | undefined) => (t ? { template: t } : {});
    return [
      { key: 'number', header: 'Number', width: 140 },
      { key: 'type', header: 'Type', width: 100, ...opt(ty) },
      { key: 'issuedOn', header: 'Issued', width: 110, ...opt(iss) },
      { key: 'dueOn', header: 'Due', width: 110, ...opt(due) },
      { key: 'totalAmount', header: 'Total', width: 140, ...opt(tot) },
      { key: 'paidAmount', header: 'Paid', width: 130, ...opt(paid) },
      { key: 'balance', header: 'Balance', width: 130, ...opt(bal) },
      { key: 'status', header: 'Status', width: 100, ...opt(st) },
    ];
  });

  readonly statusTone = (s: InvoiceResponse['status']) => InvoiceStatusEnum.tone(s);
  readonly shortDate = (iso: string) =>
    new Date(iso).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  readonly isOverdue = (inv: InvoiceResponse) =>
    inv.status === 'Open' && !!inv.dueOn && new Date(inv.dueOn).getTime() < Date.now();

  ngOnInit(): void {
    this.projectId.set(this.route.snapshot.paramMap.get('projectId') ?? '');
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.api.getByProject(this.projectId(), { pageSize: 100 }).subscribe({
      next: (paged) => {
        this.invoices.set(paged.items);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  goNew(): void {
    void this.router.navigate(['/finance/projects', this.projectId(), 'invoices', 'new']);
  }
  open(inv: InvoiceResponse): void {
    void this.router.navigate(['/finance/projects', this.projectId(), 'invoices', inv.id]);
  }
}

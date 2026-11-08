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
import { catchError, of } from 'rxjs';
import { CatalogService } from '@platform/i18n/catalog.service';
import { PermissionsService } from '@platform/permissions';
import { LedgerAllocateComponent, LedgerAllocateData } from './ledger-allocate.component';
import { LedgerEntryService } from '../../data/ledger-entry.service';
import { LedgerEntryResponse } from '../../model/ledger-entry.model';
import { CanDirective, PERM } from '@platform/permissions';
import * as LedgerTypeEnum from '../../model/enums/ledger-entry-type.enum';
import { LocaleService } from '@platform/i18n';
import { MoneyService } from '@shared/ui/money.service';
import {
  ColumnDef,
  PeraBadgeComponent,
  PeraButtonComponent,
  PeraDataTableComponent,
  PeraPageHeaderComponent,
  ModalService,
} from '@ds';

@Component({
  selector: 'app-ledger-list',
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
      title="Ledger"
      subtitle="Append-only money movements — commitments, actual costs, client payments."
    >
      <div actions>
        <ng-container *peraCan="recordPayment">
          <pera-button variant="primary" iconStart="plus" (click)="goNew()">Post entry</pera-button>
        </ng-container>
      </div>
    </pera-page-header>
    <div class="px-8 py-6">
      <pera-data-table
        [columns]="columns()"
        [rows]="entries()"
        [loading]="loading()"
        [empty]="{
          title: 'No ledger entries',
          description: 'Post the first commitment or payment to start the ledger.',
        }"
      />
    </div>

    <ng-template #dateCell let-row
      ><span class="font-mono fs-label">{{ shortDate(row.occurredOn) }}</span></ng-template
    >
    <ng-template #typeCell let-row
      ><pera-badge [tone]="typeTone(row.type)">{{ row.type }}</pera-badge></ng-template
    >
    <ng-template #dirCell let-row>
      <span
        class="inline-flex items-center gap-1 font-mono fs-label uppercase"
        [class.text-success]="row.direction === 'In'"
        [class.text-danger]="row.direction === 'Out'"
      >
        {{ row.direction === 'In' ? '↓ IN' : '↑ OUT' }}
      </span>
    </ng-template>
    <ng-template #amountCell let-row
      ><span
        class="font-mono tabular-nums font-medium"
        [class.text-success]="row.direction === 'In'"
        [class.line-through]="row.isReversed"
        [class.opacity-60]="row.isReversed"
        >{{ money.format(row.amount, 'EGP', locale.locale()) }}</span
      ></ng-template
    >
    <ng-template #refCell let-row
      ><span class="font-mono fs-label text-text-muted">{{
        row.reference || '—'
      }}</span></ng-template
    >
    <ng-template #noteCell let-row
      ><span class="fs-caption text-text-secondary truncate">{{
        row.note || ''
      }}</span></ng-template
    >
    <!-- Sync W1-11: allocate a payment that still has an unallocated remainder (record_payment). -->
    <ng-template #actionsCell let-row>
      @if (canAllocate() && unallocated().get(row.id); as rest) {
        <pera-button size="sm" variant="ghost" (click)="allocate(row.id, rest)" data-allocate>{{
          catalog.t('ledger.allocate')
        }}</pera-button>
      }
    </ng-template>
  `,
})
export class LedgerListComponent implements OnInit {
  private readonly api = inject(LedgerEntryService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  readonly money = inject(MoneyService);
  readonly locale = inject(LocaleService);

  readonly recordPayment = PERM.finance.recordPayment;
  readonly projectId = signal('');
  readonly loading = signal(true);
  readonly entries = signal<LedgerEntryResponse[]>([]);
  /** Entry id → unallocated remainder, from `GET …/by-project/{projectId}/unallocated`. */
  readonly unallocated = signal<Map<string, string>>(new Map());
  private readonly modal = inject(ModalService);
  private readonly perms = inject(PermissionsService);
  protected readonly catalog = inject(CatalogService);
  /** Allocation is `finance.record_payment` (LedgerEntryEndpoints.cs, `/{id}/allocate`). */
  readonly canAllocate = computed(() => this.perms.can(PERM.finance.recordPayment));

  private readonly dateTpl = viewChild<TemplateRef<unknown>>('dateCell');
  private readonly typeTpl = viewChild<TemplateRef<unknown>>('typeCell');
  private readonly dirTpl = viewChild<TemplateRef<unknown>>('dirCell');
  private readonly amountTpl = viewChild<TemplateRef<unknown>>('amountCell');
  private readonly refTpl = viewChild<TemplateRef<unknown>>('refCell');
  private readonly noteTpl = viewChild<TemplateRef<unknown>>('noteCell');
  private readonly actionsTpl = viewChild<TemplateRef<unknown>>('actionsCell');

  readonly columns = computed<ColumnDef<LedgerEntryResponse>[]>(() => {
    const opt = (t: TemplateRef<unknown> | undefined) => (t ? { template: t } : {});
    return [
      { key: 'occurredOn', header: 'Date', width: 110, ...opt(this.dateTpl()) },
      { key: 'type', header: 'Type', width: 130, ...opt(this.typeTpl()) },
      { key: 'direction', header: 'Dir', width: 80, ...opt(this.dirTpl()) },
      { key: 'amount', header: 'Amount', width: 150, ...opt(this.amountTpl()) },
      { key: 'reference', header: 'Reference', minWidth: 220, ...opt(this.refTpl()) },
      { key: 'note', header: 'Note', minWidth: 220, ...opt(this.noteTpl()) },
      { key: 'id', header: '', width: 110, sortable: false, ...opt(this.actionsTpl()) },
    ];
  });

  readonly typeTone = (t: LedgerEntryResponse['type']) => LedgerTypeEnum.tone(t);
  readonly shortDate = (iso: string) =>
    new Date(iso).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });

  ngOnInit(): void {
    this.projectId.set(this.route.snapshot.paramMap.get('projectId') ?? '');
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.api.getByProject(this.projectId(), { pageSize: 100 }).subscribe({
      next: (paged) => {
        this.entries.set(paged.items);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
    this.api
      .getUnallocated(this.projectId())
      .pipe(catchError(() => of(new Map<string, string>())))
      .subscribe((m) => this.unallocated.set(m));
  }

  /** Open the allocate dialog for one payment; reload when it allocated. */
  async allocate(entryId: string, unallocated: string): Promise<void> {
    const data: LedgerAllocateData = { projectId: this.projectId(), entryId, unallocated };
    const done = await this.modal
      .open<boolean>(LedgerAllocateComponent, { size: 'md', data })
      .afterClosed();
    if (done) this.load();
  }

  goNew(): void {
    void this.router.navigate(['/finance/projects', this.projectId(), 'ledger', 'new']);
  }
}

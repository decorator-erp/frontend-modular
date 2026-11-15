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
import { VariationService } from '../../data/variation.service';
import { VariationResponse } from '../../model/variation.model';
import { CanDirective, PERM } from '@platform/permissions';
import * as VariationStatusEnum from '../../model/enums/variation-status.enum';
import { LocaleService } from '@platform/i18n';
import { MoneyService } from '@shared/ui/money.service';
import {
  ColumnDef,
  ModalService,
  PeraBadgeComponent,
  PeraButtonComponent,
  PeraDataTableComponent,
  PeraPageHeaderComponent,
} from '@ds';
import { VariationRaiseComponent, VariationRaiseData } from './variation-raise.component';

@Component({
  selector: 'app-variations-list',
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
      title="Variations"
      subtitle="Budget variations and client differences awaiting approval, signing, or apply."
    >
      <div actions>
        <ng-container *peraCan="manageVariation">
          <pera-button variant="primary" iconStart="plus" (click)="openRaise()"
            >Raise variation</pera-button
          >
        </ng-container>
      </div>
    </pera-page-header>
    <div class="px-4 md:px-6 lg:px-8 py-6">
      <pera-data-table
        [columns]="columns()"
        [rows]="variations()"
        [loading]="loading()"
        [empty]="{
          title: 'No variations',
          description: 'Raise a variation when budget or client choice needs a change order.',
        }"
        [hasRowClick]="true"
        (rowClick)="open($event)"
      />
    </div>

    <ng-template #kindCell let-row
      ><span class="font-mono fs-label uppercase tracking-[0.04em] text-text-secondary">{{
        row.kind === 'ClientDifference' ? 'Client diff' : 'Internal'
      }}</span></ng-template
    >
    <ng-template #amountCell let-row
      ><span class="font-mono tabular-nums">{{
        money.format(row.amount, 'EGP', locale.locale())
      }}</span></ng-template
    >
    <ng-template #statusCell let-row
      ><pera-badge [tone]="statusTone(row.status)">{{ row.status }}</pera-badge></ng-template
    >
  `,
})
export class VariationsListComponent implements OnInit {
  private readonly api = inject(VariationService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly modal = inject(ModalService);
  readonly money = inject(MoneyService);
  readonly locale = inject(LocaleService);

  readonly manageVariation = PERM.finance.manageVariation;
  readonly projectId = signal('');
  readonly loading = signal(true);
  readonly variations = signal<VariationResponse[]>([]);

  private readonly kindTpl = viewChild<TemplateRef<unknown>>('kindCell');
  private readonly amountTpl = viewChild<TemplateRef<unknown>>('amountCell');
  private readonly statusTpl = viewChild<TemplateRef<unknown>>('statusCell');

  readonly columns = computed<ColumnDef<VariationResponse>[]>(() => {
    const k = this.kindTpl();
    const a = this.amountTpl();
    const s = this.statusTpl();
    return [
      { key: 'kind', header: 'Kind', width: 130, ...(k ? { template: k } : {}) },
      { key: 'reason', header: 'Reason', minWidth: 280 },
      { key: 'amount', header: 'Amount', width: 140, ...(a ? { template: a } : {}) },
      { key: 'status', header: 'Status', width: 110, ...(s ? { template: s } : {}) },
    ];
  });

  readonly statusTone = (s: VariationResponse['status']) => VariationStatusEnum.tone(s);

  ngOnInit(): void {
    this.projectId.set(this.route.snapshot.paramMap.get('projectId') ?? '');
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.api.getByProject(this.projectId()).subscribe({
      next: (list) => {
        this.variations.set(list);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  async openRaise(): Promise<void> {
    const data: VariationRaiseData = { projectId: this.projectId() };
    const result = await this.modal
      .open<string | false>(VariationRaiseComponent, { size: 'md', data })
      .afterClosed();
    if (result) this.load();
  }

  open(v: VariationResponse): void {
    void this.router.navigate(['/finance/projects', this.projectId(), 'variations', v.id]);
  }
}

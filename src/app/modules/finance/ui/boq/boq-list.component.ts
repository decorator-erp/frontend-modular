import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { BoqSnapshotService } from '../../data/boq-snapshot.service';
import { BoqSnapshotResponse } from '../../model/boq-snapshot.model';
import { CanDirective, PERM } from '@platform/permissions';
import {
  ColumnDef,
  ModalService,
  PeraButtonComponent,
  PeraDataTableComponent,
  PeraPageHeaderComponent,
} from '@ds';
import { BoqGenerateComponent, BoqGenerateData } from './boq-generate.component';

@Component({
  selector: 'app-boq-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CanDirective, PeraButtonComponent, PeraDataTableComponent, PeraPageHeaderComponent],
  host: { class: 'block bg-bg min-h-full' },
  template: `
    <pera-page-header
      title="BOQ snapshots"
      subtitle="Frozen Bill of Quantities at each milestone — StageClose · ProjectFinal · Manual."
    >
      <div actions>
        <ng-container *peraCan="generateBoq">
          <pera-button variant="primary" iconStart="plus" (click)="openGenerate()"
            >Generate snapshot</pera-button
          >
        </ng-container>
      </div>
    </pera-page-header>
    <div class="px-8 py-6">
      <pera-data-table
        [columns]="columns"
        [rows]="snapshots()"
        [loading]="loading()"
        [empty]="{
          title: 'No snapshots yet',
          description: 'Generate the first BOQ snapshot when a stage closes or the project ships.',
        }"
        [hasRowClick]="true"
        (rowClick)="open($event)"
      />
    </div>
  `,
})
export class BoqListComponent implements OnInit {
  private readonly api = inject(BoqSnapshotService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly modal = inject(ModalService);

  readonly generateBoq = PERM.finance.generateBoq;
  readonly projectId = signal('');
  readonly loading = signal(true);
  readonly snapshots = signal<BoqSnapshotResponse[]>([]);

  readonly columns: ColumnDef<BoqSnapshotResponse>[] = [
    { key: 'version', header: 'Version', width: 90 },
    { key: 'type', header: 'Type', width: 130 },
    { key: 'generatedAt', header: 'Generated', width: 150 },
    { key: 'budgetedTotal', header: 'Budgeted', width: 130 },
    { key: 'purchaseTotal', header: 'Purchase', width: 130 },
    { key: 'actualTotal', header: 'Actual', width: 130 },
    { key: 'differenceTotal', header: 'Difference', width: 130 },
  ];

  ngOnInit(): void {
    this.projectId.set(this.route.snapshot.paramMap.get('projectId') ?? '');
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.api.getByProject(this.projectId()).subscribe({
      next: (list) => {
        this.snapshots.set(list);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  async openGenerate(): Promise<void> {
    const data: BoqGenerateData = { projectId: this.projectId() };
    const id = await this.modal
      .open<string | false>(BoqGenerateComponent, { size: 'sm', data })
      .afterClosed();
    if (id) this.load();
  }

  open(s: BoqSnapshotResponse): void {
    void this.router.navigate(['/finance/projects', this.projectId(), 'boq', s.id]);
  }
}

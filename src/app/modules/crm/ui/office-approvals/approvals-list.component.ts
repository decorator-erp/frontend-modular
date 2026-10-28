import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { catchError, of } from 'rxjs';
import { CrmApprovalsService } from '../../data/crm-approvals.service';
import { CatalogService } from '@platform/i18n/catalog.service';
import type { PendingApproval } from '../../model';
import {
  PeraCardComponent,
  PeraEmptyComponent,
  PeraPageHeaderComponent,
  PeraSkeletonComponent,
} from '@ds';

/** Office "my approvals" inbox — full-page list of `GET /api/approvals/pending` (minimal house-styled screen). */
@Component({
  selector: 'app-approvals-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PeraCardComponent, PeraEmptyComponent, PeraPageHeaderComponent, PeraSkeletonComponent],
  host: { class: 'block' },
  template: `
    <pera-page-header [title]="catalog.t('dash.wAttnTitle')" [count]="total()" />
    <div class="p-4 flex flex-col gap-3 max-w-[var(--w-form)]">
      @if (loading()) {
        <pera-skeleton [height]="64" />
        <pera-skeleton [height]="64" />
      } @else if (!rows().length) {
        <pera-empty [title]="catalog.t('dash.attnEmpty')" iconName="check-circle" />
      } @else {
        @for (a of rows(); track a.trackKey) {
          <pera-card>
            <div class="flex flex-col gap-0.5">
              <span class="fs-body-sm font-medium text-text-primary">{{
                a.gateLabel || a.projectName
              }}</span>
              <span class="fs-caption text-text-muted">
                {{ a.projectName }} · {{ catalog.t('dash.round', { round: a.round }) }}
              </span>
            </div>
          </pera-card>
        }
      }
    </div>
  `,
})
export class ApprovalsListComponent implements OnInit {
  private readonly api = inject(CrmApprovalsService);
  protected readonly catalog = inject(CatalogService);

  readonly loading = signal(true);
  readonly rows = signal<PendingApproval[]>([]);
  readonly total = signal(0);

  ngOnInit(): void {
    this.api
      .pending(1, 50)
      .pipe(catchError(() => of(null)))
      .subscribe((page) => {
        if (page) {
          this.rows.set(page.items);
          this.total.set(page.totalCount);
        }
        this.loading.set(false);
      });
  }
}

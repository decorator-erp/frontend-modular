import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { catchError, of } from 'rxjs';
import {
  CrmMyGatheringWorkService,
  type MyGatheringWorkItem,
} from '../../data/crm-my-gathering-work.service';
import { CatalogService } from '@platform/i18n/catalog.service';
import {
  PeraCardComponent,
  PeraEmptyComponent,
  PeraPageHeaderComponent,
  PeraSkeletonComponent,
} from '@ds';

/** Full-page list of the logged-in employee's assigned gathering tasks (minimal house-styled screen). */
@Component({
  selector: 'app-crm-my-work',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PeraCardComponent, PeraEmptyComponent, PeraPageHeaderComponent, PeraSkeletonComponent],
  host: { class: 'block' },
  template: `
    <pera-page-header [title]="catalog.t('dash.wTasksTitle')" [count]="rows().length" />
    <div class="p-4 flex flex-col gap-3 max-w-[var(--w-form)]">
      @if (loading()) {
        <pera-skeleton [height]="72" />
        <pera-skeleton [height]="72" />
      } @else if (!rows().length) {
        <pera-empty [title]="catalog.t('dash.tasksEmpty')" iconName="check-circle" />
      } @else {
        @for (t of rows(); track t.trackKey) {
          <pera-card>
            <div class="flex items-start justify-between gap-3">
              <div class="flex flex-col gap-0.5 min-w-0">
                <span class="fs-body-sm font-medium text-text-primary">{{ t.taskName }}</span>
                <span class="fs-caption text-text-muted">
                  {{ t.projectName }} ·
                  {{
                    catalog.t('dash.taskCounts', {
                      entries: t.taskBlock.entryPending,
                      unresolved: t.taskBlock.unresolvedTotal,
                    })
                  }}
                </span>
              </div>
            </div>
          </pera-card>
        }
      }
    </div>
  `,
})
export class CrmMyWorkComponent implements OnInit {
  private readonly api = inject(CrmMyGatheringWorkService);
  protected readonly catalog = inject(CatalogService);

  readonly loading = signal(true);
  readonly rows = signal<MyGatheringWorkItem[]>([]);

  ngOnInit(): void {
    this.api
      .list()
      .pipe(catchError(() => of([] as MyGatheringWorkItem[])))
      .subscribe((rows) => {
        this.rows.set(rows);
        this.loading.set(false);
      });
  }
}

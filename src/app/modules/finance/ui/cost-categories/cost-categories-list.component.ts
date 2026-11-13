import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Subject } from 'rxjs';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CostCategoryService } from '../../data/cost-category.service';
import { ErrorHandlerService, friendly } from '@platform/http/error-handler.service';
import { ToastService } from '@platform/feedback/toast.service';
import { CanDirective, PERM } from '@platform/permissions';
import { CostCategoryResponse } from '../../model/cost-category.model';
import {
  ConfirmService,
  ModalService,
  PeraBadgeComponent,
  PeraButtonComponent,
  PeraEmptyComponent,
  PeraPageHeaderComponent,
  PeraSkeletonComponent,
} from '@ds';
import { CostCategoryFormComponent, CostCategoryFormData } from './cost-category-form.component';

const PAGE_SIZE = 20;
type StatusFilter = 'active' | 'inactive' | 'all';

/**
 * `/finance/cost-categories` — org-wide catalog of cost categories.
 *
 * Mirrors the studio's existing list pattern (Clients, Departments) with a
 * search box, status filter chips, paged table, and inline create / edit /
 * activate-toggle row actions. Gated on `Finance.ManageBudget` for writes;
 * `Finance.Read` for reads.
 */
@Component({
  selector: 'app-cost-categories-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    CanDirective,
    PeraBadgeComponent,
    PeraButtonComponent,
    PeraEmptyComponent,
    PeraPageHeaderComponent,
    PeraSkeletonComponent,
  ],
  host: { class: 'block bg-bg min-h-full' },
  template: `
    <pera-page-header title="Cost categories" [count]="totalCount() + ' total'">
      <div actions class="flex gap-2 items-center">
        <pera-button
          *peraCan="cap.manageCostCategory"
          variant="primary"
          iconStart="plus"
          (click)="openCreate()"
          >New category</pera-button
        >
      </div>

      <div toolbar class="flex items-center gap-2.5 flex-wrap w-full">
        <label
          class="inline-flex items-center gap-2 px-3 py-2 border border-border bg-bg min-w-[var(--w-panel)] focus-within:border-accent transition-colors"
        >
          <svg
            width="13"
            height="13"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            class="text-text-muted"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="M21 21l-4.3-4.3" />
          </svg>
          <input
            type="text"
            placeholder="Search by code or name"
            [ngModel]="search()"
            (ngModelChange)="onSearchInput($event)"
            class="border-0 outline-0 bg-transparent font-sans fs-caption text-text-primary flex-1 min-w-0"
          />
        </label>
        <div class="inline-flex border border-border bg-bg">
          @for (opt of statusOptions; track opt.value) {
            <button
              type="button"
              (click)="onStatusChange(opt.value)"
              class="px-3 py-2 font-mono fs-label uppercase tracking-wide transition-colors"
              [class.bg-selected]="status() === opt.value"
              [class.text-text-primary]="status() === opt.value"
              [class.text-text-muted]="status() !== opt.value"
              [class.hover:text-text-primary]="status() !== opt.value"
            >
              {{ opt.label }}
            </button>
          }
        </div>
      </div>
    </pera-page-header>

    <div class="bg-bg">
      @if (loading()) {
        <div class="p-6"><pera-skeleton width="100%" [height]="240"></pera-skeleton></div>
      } @else if (!rows().length) {
        <pera-empty
          iconName="archive"
          title="No cost categories"
          description="Create one to start grouping budget lines."
        ></pera-empty>
      } @else {
        <div class="overflow-x-auto">
          <table class="w-full border-collapse">
            <thead>
              <tr>
                <th
                  class="text-start font-mono fs-micro uppercase text-text-muted font-medium px-4 py-2.5 border-b border-border bg-surface"
                  style="width: var(--w-field);"
                >
                  Code
                </th>
                <th
                  class="text-start font-mono fs-micro uppercase text-text-muted font-medium px-4 py-2.5 border-b border-border bg-surface"
                >
                  Name
                </th>
                <th
                  class="text-start font-mono fs-micro uppercase text-text-muted font-medium px-4 py-2.5 border-b border-border bg-surface"
                >
                  Description
                </th>
                <th
                  class="text-start font-mono fs-micro uppercase text-text-muted font-medium px-4 py-2.5 border-b border-border bg-surface"
                  style="width: var(--w-column);"
                >
                  Status
                </th>
                <th
                  class="text-end font-mono fs-micro uppercase text-text-muted font-medium px-4 py-2.5 border-b border-border bg-surface"
                  style="width: var(--w-column-lg);"
                >
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              @for (row of rows(); track row.id) {
                <tr class="hover:bg-surface-muted transition-colors">
                  <td
                    class="px-4 py-2.5 border-b border-border-soft font-mono fs-label text-text-secondary"
                  >
                    {{ row.code }}
                  </td>
                  <td class="px-4 py-2.5 border-b border-border-soft fs-caption font-medium">
                    {{ row.name }}
                  </td>
                  <td
                    class="px-4 py-2.5 border-b border-border-soft fs-caption text-text-secondary truncate max-w-[var(--w-dialog)]"
                  >
                    {{ row.description || '—' }}
                  </td>
                  <td class="px-4 py-2.5 border-b border-border-soft">
                    <pera-badge
                      [tone]="row.isActive ? 'success' : 'neutral'"
                      size="micro"
                      [dot]="true"
                    >
                      {{ row.isActive ? 'Active' : 'Inactive' }}
                    </pera-badge>
                  </td>
                  <td class="px-4 py-2.5 border-b border-border-soft text-end">
                    <div class="inline-flex gap-1.5">
                      <pera-button
                        *peraCan="cap.manageCostCategory"
                        size="sm"
                        variant="ghost"
                        (click)="openEdit(row)"
                        >Edit</pera-button
                      >
                      @if (row.isActive) {
                        <pera-button
                          *peraCan="cap.manageCostCategory"
                          size="sm"
                          variant="ghost"
                          (click)="toggleActive(row)"
                          >Deactivate</pera-button
                        >
                      } @else {
                        <pera-button
                          *peraCan="cap.manageCostCategory"
                          size="sm"
                          variant="ghost"
                          (click)="toggleActive(row)"
                          >Activate</pera-button
                        >
                      }
                    </div>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
        @if (totalPages() > 1) {
          <div
            class="px-6 py-3.5 font-mono fs-label text-text-muted border-t border-border bg-surface flex justify-between items-center"
          >
            <span>Showing page {{ page() }} of {{ totalPages() }}</span>
            <div class="flex gap-1">
              <pera-button
                size="sm"
                variant="ghost"
                [disabled]="page() <= 1"
                (click)="onPage(page() - 1)"
                >Prev</pera-button
              >
              <pera-button
                size="sm"
                variant="ghost"
                [disabled]="page() >= totalPages()"
                (click)="onPage(page() + 1)"
                >Next</pera-button
              >
            </div>
          </div>
        }
      }
    </div>
  `,
})
export class CostCategoriesListComponent implements OnInit {
  private readonly api = inject(CostCategoryService);
  private readonly modal = inject(ModalService);
  private readonly confirm = inject(ConfirmService);
  private readonly toast = inject(ToastService);
  private readonly errors = inject(ErrorHandlerService);

  protected readonly cap = PERM.finance;
  readonly loading = signal(true);
  readonly rows = signal<CostCategoryResponse[]>([]);
  readonly totalCount = signal(0);
  readonly page = signal(1);
  readonly pageSize = signal(PAGE_SIZE);
  readonly search = signal('');
  readonly status = signal<StatusFilter>('active');

  readonly totalPages = computed(() => Math.max(1, Math.ceil(this.totalCount() / this.pageSize())));

  readonly statusOptions: { value: StatusFilter; label: string }[] = [
    { value: 'active', label: 'Active' },
    { value: 'inactive', label: 'Inactive' },
    { value: 'all', label: 'All' },
  ];

  private readonly searchInput$ = new Subject<string>();

  constructor() {
    this.searchInput$
      .pipe(debounceTime(300), distinctUntilChanged(), takeUntilDestroyed())
      .subscribe((term) => {
        this.search.set(term);
        this.page.set(1);
        this.reload();
      });
  }

  ngOnInit(): void {
    this.reload();
  }

  reload(): void {
    this.loading.set(true);
    const status = this.status();
    this.api
      .getAll({
        searchTerm: this.search().trim() || undefined,
        isActive: status === 'all' ? undefined : status === 'active',
        pageNumber: this.page(),
        pageSize: this.pageSize(),
      })
      .subscribe({
        next: (paged) => {
          this.rows.set(paged.items);
          this.totalCount.set(paged.totalCount);
          this.loading.set(false);
        },
        error: () => {
          this.rows.set([]);
          this.totalCount.set(0);
          this.loading.set(false);
        },
      });
  }

  onSearchInput(term: string): void {
    this.searchInput$.next(term);
  }

  onStatusChange(value: StatusFilter): void {
    this.status.set(value);
    this.page.set(1);
    this.reload();
  }

  onPage(page: number): void {
    if (page < 1 || page > this.totalPages()) return;
    this.page.set(page);
    this.reload();
  }

  async openCreate(): Promise<void> {
    const ref = this.modal.open<boolean, CostCategoryFormComponent>(CostCategoryFormComponent, {
      size: 'md',
    });
    if (await ref.afterClosed()) this.reload();
  }

  async openEdit(row: CostCategoryResponse): Promise<void> {
    const data: CostCategoryFormData = {
      id: row.id,
      initial: { code: row.code, name: row.name, description: row.description },
    };
    const ref = this.modal.open<boolean, CostCategoryFormComponent>(CostCategoryFormComponent, {
      size: 'md',
      data,
    });
    if (await ref.afterClosed()) this.reload();
  }

  async toggleActive(row: CostCategoryResponse): Promise<void> {
    const verb = row.isActive ? 'Deactivate' : 'Activate';
    const ok = await this.confirm.open({
      title: `${verb} cost category`,
      body: `${row.name} (${row.code}) will be ${row.isActive ? 'hidden from' : 'visible in'} new budget-line selectors.`,
      confirmLabel: verb,
      tone: row.isActive ? 'danger' : 'default',
    });
    if (!ok) return;
    const obs$ = row.isActive ? this.api.deactivate(row.id) : this.api.activate(row.id);
    obs$.subscribe({
      next: () => {
        this.toast.show({
          tone: 'success',
          message: `${row.name} ${row.isActive ? 'deactivated' : 'activated'}`,
        });
        this.reload();
      },
      error: (err: HttpErrorResponse) =>
        this.toast.show({ tone: 'danger', message: friendly(this.errors.parse(err)) }),
    });
  }
}

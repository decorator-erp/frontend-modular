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
import { Router } from '@angular/router';
import { Subject } from 'rxjs';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ClientService } from '@modules/clients';
import { LocaleService } from '@platform/i18n';
import { ProjectStatus, WorkflowType } from '../../model/project.model';
import { ProjectSearchService, ProjectWithCode } from '../../data/project-search.service';
import { projectStatusLabel, projectStatusTone } from '@shared/ui/status';
import {
  ColumnDef,
  FilterFacet,
  FilterState,
  PeraAvatarComponent,
  PeraButtonComponent,
  PeraCurrencyComponent,
  PeraDataTableComponent,
  PeraEmptyComponent,
  PeraFilterBarComponent,
  PeraPageHeaderComponent,
  PeraSkeletonComponent,
  SelectOption,
  TableSort,
} from '@ds';

const PAGE_SIZE = 20;

@Component({
  selector: 'app-projects-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    PeraAvatarComponent,
    PeraButtonComponent,
    PeraCurrencyComponent,
    PeraDataTableComponent,
    PeraEmptyComponent,
    PeraFilterBarComponent,
    PeraPageHeaderComponent,
    PeraSkeletonComponent,
  ],
  templateUrl: './projects-list.component.html',
})
export class ProjectsListComponent implements OnInit {
  private readonly searchApi = inject(ProjectSearchService);
  private readonly clientsApi = inject(ClientService);
  private readonly router = inject(Router);
  readonly locale = inject(LocaleService);

  readonly loading = signal(true);
  readonly rows = signal<ProjectWithCode[]>([]);
  readonly totalCount = signal(0);
  readonly page = signal(1);
  readonly search = signal('');
  readonly status = signal<ProjectStatus | null>(null);
  readonly workflowType = signal<WorkflowType | null>(null);
  readonly clientId = signal<string | null>(null);
  readonly sort = signal<TableSort>({ sortBy: 'name', sortDir: 'asc' });
  readonly view = signal<'cards' | 'table'>(
    (typeof localStorage !== 'undefined' &&
      (localStorage.getItem('pera.projects.view') as 'cards' | 'table')) ||
      'cards',
  );

  private readonly searchInput$ = new Subject<string>();

  readonly statusOptions: SelectOption[] = [
    { value: null, label: 'All statuses' },
    { value: 'Draft', label: 'Draft' },
    { value: 'InProgress', label: 'In progress' },
    { value: 'OnHold', label: 'On hold' },
    { value: 'Completed', label: 'Completed' },
    { value: 'Cancelled', label: 'Cancelled' },
  ];
  readonly typeOptions: SelectOption[] = [
    { value: null, label: 'All types' },
    { value: 'Stage', label: 'Stage-based' },
    { value: 'FreeStyle', label: 'Free-style' },
  ];
  readonly clientOptions = signal<SelectOption[]>([{ value: null, label: 'All clients' }]);

  /** Controlled `pera-filter-bar` state. Mirrors the four filter signals below. */
  readonly filters = signal<FilterState>({});

  /**
   * Exactly the filters this screen already supported: the three the toolbar
   * printed as inert `<span>` chips, plus the search box that already worked.
   */
  readonly facets = computed<FilterFacet[]>(() => [
    { key: 'status', label: 'Status', options: this.facetOptions(this.statusOptions) },
    { key: 'workflowType', label: 'Type', options: this.facetOptions(this.typeOptions) },
    { key: 'clientId', label: 'Client', options: this.facetOptions(this.clientOptions()) },
  ]);

  /** `pera-filter-bar` facets are string-keyed; drop the "All …" null sentinel. */
  private facetOptions(options: SelectOption[]): { value: string; label: string }[] {
    return options
      .filter((o) => o.value !== null && o.value !== undefined)
      .map((o) => ({ value: String(o.value), label: o.label }));
  }

  private readonly codeTpl = viewChild.required<TemplateRef<unknown>>('codeTpl');
  private readonly statusTpl = viewChild.required<TemplateRef<unknown>>('statusTpl');
  private readonly typeTpl = viewChild.required<TemplateRef<unknown>>('typeTpl');
  private readonly progressTpl = viewChild.required<TemplateRef<unknown>>('progressTpl');
  private readonly ownerTpl = viewChild.required<TemplateRef<unknown>>('ownerTpl');
  private readonly budgetTpl = viewChild.required<TemplateRef<unknown>>('budgetTpl');

  readonly columns = computed<ColumnDef<ProjectWithCode>[]>(() => [
    { key: 'code', header: 'Code', width: 100, sortable: true, template: this.codeTpl() },
    { key: 'name', header: 'Project', minWidth: 200, sortable: true },
    { key: 'status', header: 'Status', width: 120, sortable: true, template: this.statusTpl() },
    { key: 'workflowType', header: 'Type', width: 100, template: this.typeTpl() },
    { key: 'clientName', header: 'Client', width: 160, sortable: true },
    {
      key: 'progressPercentage',
      header: 'Progress',
      width: 120,
      sortable: true,
      template: this.progressTpl(),
    },
    { key: 'productOwnerName', header: 'Owner', width: 140, template: this.ownerTpl() },
    {
      key: 'estimatedBudget',
      header: 'Budget',
      width: 120,
      sortable: true,
      template: this.budgetTpl(),
    },
  ]);

  readonly statusTone = projectStatusTone;
  readonly statusLabel = projectStatusLabel;

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
    this.clientsApi
      .getAll()
      .subscribe((list) =>
        this.clientOptions.set([
          { value: null, label: 'All clients' },
          ...list.map((c) => ({ value: c.id, label: `${c.firstName} ${c.lastName}` })),
        ]),
      );
  }

  reload(): void {
    this.loading.set(true);
    this.searchApi
      .search({
        searchTerm: this.search().trim() || undefined,
        status: this.status() ?? undefined,
        workflowType: this.workflowType() ?? undefined,
        clientId: this.clientId() ?? undefined,
        sortBy: this.sort().sortBy,
        sortDir: this.sort().sortDir,
        page: this.page(),
        pageSize: PAGE_SIZE,
      })
      .subscribe({
        next: (result) => {
          this.rows.set(result.items);
          this.totalCount.set(result.totalCount);
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

  /**
   * `pera-filter-bar` treats facets as multiselect; every filter this endpoint
   * accepts is single-valued, so the last pick wins and the state is written
   * back normalised (one value per key). Search is debounced; facets re-query
   * immediately, as the old `onFilter()` did.
   */
  onFilters(state: FilterState): void {
    const last = (key: string): string | null => state.facets?.[key]?.at(-1) ?? null;
    const status = last('status') as ProjectStatus | null;
    const workflowType = last('workflowType') as WorkflowType | null;
    const clientId = last('clientId');

    const facets: Record<string, string[]> = {};
    if (status) facets['status'] = [status];
    if (workflowType) facets['workflowType'] = [workflowType];
    if (clientId) facets['clientId'] = [clientId];
    this.filters.set({ search: state.search, facets });

    const term = state.search ?? '';
    const searchChanged = term !== this.search();
    const facetsChanged =
      status !== this.status() ||
      workflowType !== this.workflowType() ||
      clientId !== this.clientId();

    this.status.set(status);
    this.workflowType.set(workflowType);
    this.clientId.set(clientId);

    if (searchChanged) {
      this.onSearchInput(term);
      return;
    }
    if (facetsChanged) {
      this.page.set(1);
      this.reload();
    }
  }

  onClearFilters(): void {
    this.filters.set({});
    this.search.set('');
    this.status.set(null);
    this.workflowType.set(null);
    this.clientId.set(null);
    this.page.set(1);
    this.reload();
  }

  onSort(sort: TableSort): void {
    this.sort.set(sort);
    this.reload();
  }

  onPage(page: number): void {
    this.page.set(page);
    this.reload();
  }

  readonly pageSize = PAGE_SIZE;
  rowId = (row: ProjectWithCode): string => row.id;

  openNew(): void {
    void this.router.navigate(['/projects', 'new']);
  }

  open(row: ProjectWithCode): void {
    void this.router.navigate(['/projects', row.id]);
  }

  setView(v: 'cards' | 'table'): void {
    this.view.set(v);
    if (typeof localStorage !== 'undefined') localStorage.setItem('pera.projects.view', v);
  }
}

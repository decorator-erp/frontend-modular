import { CanDirective } from '@platform/permissions';
import { CatalogService } from '@platform/i18n/catalog.service';
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
import { NgTemplateOutlet } from '@angular/common';
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
  PeraDataTableComponent,
  PeraEmptyComponent,
  PeraFilterBarComponent,
  PeraPageHeaderComponent,
  PeraProgressBarComponent,
  PeraSegmentedComponent,
  PeraSkeletonComponent,
  PeraSwatchComponent,
  SegmentedOption,
  SelectOption,
  TableSort,
} from '@ds';

const PAGE_SIZE = 20;

@Component({
  selector: 'app-projects-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    NgTemplateOutlet,
    PeraAvatarComponent,
    PeraButtonComponent,
    PeraDataTableComponent,
    PeraEmptyComponent,
    PeraFilterBarComponent,
    PeraPageHeaderComponent,
    PeraProgressBarComponent,
    PeraSegmentedComponent,
    PeraSkeletonComponent,
    PeraSwatchComponent,
    CanDirective,
  ],
  templateUrl: './projects-list.component.html',
})
export class ProjectsListComponent implements OnInit {
  private readonly searchApi = inject(ProjectSearchService);
  private readonly clientsApi = inject(ClientService);
  private readonly router = inject(Router);
  readonly locale = inject(LocaleService);

  readonly loading = signal(true);
  /** The page as read from `GET /api/projects`. */
  private readonly pageRows = signal<ProjectWithCode[]>([]);
  /**
   * Sync W2-2: `ProjectResponse.ClientName` (S6) when the backend sends it, else the client's name
   * from the client filter's own list, so a row never shows a blank client it could name.
   */
  readonly rows = computed<ProjectWithCode[]>(() => {
    const names = new Map(
      this.clientOptions()
        .filter((o) => o.value !== null && o.value !== undefined)
        .map((o) => [String(o.value), o.label]),
    );
    return this.pageRows().map((r) =>
      r.clientName || !r.clientId ? r : { ...r, clientName: names.get(r.clientId) ?? '' },
    );
  });
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
    // crmp P-10 (review R1-F5): GET /api/projects filters only by client, search and mine
    // (dms ProjectEndpoints.cs:26). The status and type facets filtered nothing and are gone.
    {
      key: 'clientId',
      label: this.catalog.t('plist.client'),
      options: this.facetOptions(this.clientOptions()),
    },
    {
      key: 'mine',
      label: this.catalog.t('plist.scope'),
      options: [{ value: 'mine', label: this.catalog.t('plist.mine') }],
    },
  ]);
  /** crmp P-10: only the projects I own or am a member of (`mine=true`). */
  readonly mine = signal(false);
  protected readonly catalog = inject(CatalogService);

  /** `pera-filter-bar` facets are string-keyed; drop the "All …" null sentinel. */
  private facetOptions(options: SelectOption[]): { value: string; label: string }[] {
    return options
      .filter((o) => o.value !== null && o.value !== undefined)
      .map((o) => ({ value: String(o.value), label: o.label }));
  }

  private readonly projectTpl = viewChild.required<TemplateRef<unknown>>('projectTpl');
  private readonly statusTpl = viewChild.required<TemplateRef<unknown>>('statusTpl');
  private readonly typeTpl = viewChild.required<TemplateRef<unknown>>('typeTpl');
  private readonly progressTpl = viewChild.required<TemplateRef<unknown>>('progressTpl');
  private readonly ownerTpl = viewChild.required<TemplateRef<unknown>>('ownerTpl');

  readonly columns = computed<ColumnDef<ProjectWithCode>[]>(() => [
    // OS-4: the code sits under the name, beside the swatch thumbnail.
    { key: 'name', header: 'Project', minWidth: 240, sortable: false, template: this.projectTpl() },
    { key: 'status', header: 'Status', width: 130, sortable: false, template: this.statusTpl() },
    {
      key: 'workflowType',
      header: 'Type',
      width: 110,
      template: this.typeTpl(),
      hideBelowLg: true,
    },
    { key: 'clientName', header: 'Client', width: 160, sortable: false, hideBelowLg: true },
    {
      key: 'progressPercentage',
      header: 'Progress',
      width: 120,
      sortable: false,
      template: this.progressTpl(),
    },
    {
      key: 'productOwnerName',
      header: 'Owner',
      width: 150,
      template: this.ownerTpl(),
      hideBelowLg: true,
    },
    // Sync W2-2: no Budget column — ProjectResponse carries no budget.
  ]);

  readonly viewOptions: SegmentedOption[] = [
    { value: 'cards', label: 'Cards' },
    { value: 'table', label: 'Table' },
  ];

  /**
   * OS-4: the status summary. `GET /api/projects` has no status filter and no status counts, so the
   * per-status counts (and picking one) work only when every match is on this page. Otherwise they
   * show "—" and only All is live. A projects `status-counts` endpoint would lift this.
   */
  readonly statusFilter = signal<ProjectStatus | null>(null);
  readonly summaryComplete = computed(
    () => this.page() === 1 && this.pageRows().length >= this.totalCount(),
  );
  readonly summary = computed(() => {
    const rows = this.rows();
    const complete = this.summaryComplete();
    const count = (s: ProjectStatus) =>
      complete ? rows.filter((r) => r.status === s).length : null;
    const card = (key: ProjectStatus, label: string, dot: string) => ({
      key: key as ProjectStatus | null,
      label,
      dot,
      count: count(key),
    });
    return [
      {
        key: null as ProjectStatus | null,
        label: 'All',
        dot: 'bg-text-muted',
        count: this.totalCount() as number | null,
      },
      card('InProgress', 'In progress', 'bg-info'),
      card('OnHold', 'On hold', 'bg-warning'),
      card('Draft', 'Draft', 'bg-sand'),
      card('Completed', 'Completed', 'bg-success'),
    ];
  });
  /** The rows shown: the page, narrowed by the picked status card when the page holds every match. */
  readonly visibleRows = computed(() => {
    const s = this.statusFilter();
    return s && this.summaryComplete() ? this.rows().filter((r) => r.status === s) : this.rows();
  });

  pickStatus(status: ProjectStatus | null): void {
    this.statusFilter.set(this.statusFilter() === status ? null : status);
  }

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
        mine: this.mine() || undefined,
        sortBy: this.sort().sortBy,
        sortDir: this.sort().sortDir,
        page: this.page(),
        pageSize: PAGE_SIZE,
      })
      .subscribe({
        next: (result) => {
          this.pageRows.set(result.items);
          this.totalCount.set(result.totalCount);
          this.loading.set(false);
        },
        error: () => {
          this.pageRows.set([]);
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
    const status = null as ProjectStatus | null;
    const workflowType = null as WorkflowType | null;
    const clientId = last('clientId');
    const mine = last('mine') === 'mine';

    const facets: Record<string, string[]> = {};
    if (clientId) facets['clientId'] = [clientId];
    if (mine) facets['mine'] = ['mine'];
    this.filters.set({ search: state.search, facets });

    const term = state.search ?? '';
    const searchChanged = term !== this.search();
    const facetsChanged =
      mine !== this.mine() ||
      status !== this.status() ||
      workflowType !== this.workflowType() ||
      clientId !== this.clientId();

    this.status.set(status);
    this.workflowType.set(workflowType);
    this.clientId.set(clientId);
    this.mine.set(mine);

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
    this.mine.set(false);
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

  setView(v: 'cards' | 'table' | unknown): void {
    if (v !== 'cards' && v !== 'table') return;
    this.view.set(v);
    if (typeof localStorage !== 'undefined') localStorage.setItem('pera.projects.view', v);
  }
}

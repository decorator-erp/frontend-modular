import { HttpErrorResponse } from '@angular/common/http';
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
import { Subject, firstValueFrom, of } from 'rxjs';
import { catchError, debounceTime, distinctUntilChanged } from 'rxjs/operators';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { ClientService } from '../data/client.service';
import { ToastService } from '@platform/feedback/toast.service';
import { ErrorHandlerService, friendly } from '@platform/http/error-handler.service';
import { CanDirective, PERM } from '@platform/permissions';
import { ClientResponse } from '../model/client.model';
import { ClientSearchService } from '../data/client-search.service';
import {
  ColumnDef,
  ConfirmService,
  FilterFacet,
  FilterState,
  ModalService,
  PeraAvatarComponent,
  PeraButtonComponent,
  PeraDataTableComponent,
  PeraEmptyComponent,
  PeraFilterBarComponent,
  PeraPageHeaderComponent,
  PeraSkeletonComponent,
  SelectOption,
  TableRowAction,
  TableSort,
} from '@ds';
import { AddClientDialogComponent } from './add-client-dialog.component';
import { EditClientDialogComponent, EditClientDialogData } from './edit-client-dialog.component';

const PAGE_SIZE = 20;

@Component({
  selector: 'app-clients-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    CanDirective,
    PeraAvatarComponent,
    PeraButtonComponent,
    PeraDataTableComponent,
    PeraEmptyComponent,
    PeraFilterBarComponent,
    PeraPageHeaderComponent,
    PeraSkeletonComponent,
  ],
  templateUrl: './clients-list.component.html',
})
export class ClientsListComponent implements OnInit {
  private readonly clientsApi = inject(ClientService);
  private readonly searchApi = inject(ClientSearchService);
  private readonly modal = inject(ModalService);
  private readonly confirm = inject(ConfirmService);
  private readonly toast = inject(ToastService);
  private readonly errors = inject(ErrorHandlerService);
  private readonly router = inject(Router);

  readonly loading = signal(true);
  readonly rows = signal<ClientResponse[]>([]);
  readonly totalCount = signal(0);
  readonly page = signal(1);
  readonly search = signal('');
  readonly status = signal<'active' | 'inactive' | 'all'>('active');
  readonly sort = signal<TableSort>({ sortBy: 'fullName', sortDir: 'asc' });

  private readonly searchInput$ = new Subject<string>();

  readonly statusOptions: SelectOption[] = [
    { value: 'active', label: 'Active' },
    { value: 'inactive', label: 'Inactive' },
    { value: 'all', label: 'All' },
  ];

  private readonly avatarTpl = viewChild.required<TemplateRef<unknown>>('avatarTpl');
  private readonly nameTpl = viewChild.required<TemplateRef<unknown>>('nameTpl');
  private readonly phoneTpl = viewChild.required<TemplateRef<unknown>>('phoneTpl');
  private readonly statusTpl = viewChild.required<TemplateRef<unknown>>('statusTpl');

  readonly columns = computed<ColumnDef<ClientResponse>[]>(() => [
    { key: 'avatar', header: '', width: 48, template: this.avatarTpl(), hideOnMobile: true },
    {
      key: 'fullName',
      header: 'Name',
      minWidth: 200,
      sortable: true,
      template: this.nameTpl(),
      value: (r) => `${r.firstName} ${r.lastName}`,
    },
    { key: 'email', header: 'Email', minWidth: 200, sortable: true },
    { key: 'phoneNumber', header: 'Phone', width: 140, template: this.phoneTpl() },
    { key: 'isActive', header: 'Status', width: 120, sortable: true, template: this.statusTpl() },
  ]);

  /** Controlled `pera-filter-bar` state — search + the one status facet the rail also drives. */
  readonly filters = signal<FilterState>({});

  readonly facets = computed<FilterFacet[]>(() => [
    {
      key: 'status',
      label: 'Status',
      options: this.statusOptions.map((o) => ({ value: String(o.value), label: o.label })),
    },
  ]);

  /**
   * Drafted in 001 and still **deliberately unsurfaced**: Edit / Deactivate /
   * Reactivate are permission-gated mutations, and Principle IV keeps them out of
   * this feature's scope. Kept so the follow-up spec that surfaces them has a
   * starting point; never passed to `pera-data-table`.
   */
  readonly rowActions: TableRowAction<ClientResponse>[] = [
    {
      label: 'Edit',
      capability: PERM.clients.update,
      action: (row) => this.openEdit(row),
    },
    {
      label: 'Deactivate',
      capability: PERM.clients.setActive,
      tone: 'danger',
      visible: (row) => row.isActive,
      action: (row) => this.deactivate(row),
    },
    {
      label: 'Reactivate',
      capability: PERM.clients.setActive,
      visible: (row) => !row.isActive,
      action: (row) => this.reactivate(row),
    },
  ];

  readonly sortedRows = computed(() => {
    const { sortBy, sortDir } = this.sort();
    const dir = sortDir === 'asc' ? 1 : -1;
    return [...this.rows()].sort((a, b) => {
      const value = (r: ClientResponse): string =>
        sortBy === 'fullName'
          ? `${r.firstName} ${r.lastName}`
          : String((r as unknown as Record<string, unknown>)[sortBy] ?? '');
      return value(a).localeCompare(value(b)) * dir;
    });
  });

  readonly pageSize = PAGE_SIZE;

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
    this.searchApi
      .search({
        searchTerm: this.search().trim() || undefined,
        isActive: status === 'all' ? undefined : status === 'active',
        page: this.page(),
        pageSize: PAGE_SIZE,
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

  /** The rail and the filter bar drive the same single status facet. */
  onFilters(state: FilterState): void {
    const status = (state.facets?.['status']?.at(-1) ?? 'active') as 'active' | 'inactive' | 'all';
    const term = state.search ?? '';
    this.filters.set({ search: state.search, facets: { status: [status] } });

    if (term !== this.search()) {
      this.onSearchInput(term);
      return;
    }
    if (status !== this.status()) {
      this.status.set(status);
      this.page.set(1);
      this.reload();
    }
  }

  onClearFilters(): void {
    this.filters.set({});
    this.search.set('');
    this.status.set('active');
    this.page.set(1);
    this.reload();
  }

  /** Client-side: sorts the current page's rows (the endpoint takes no sort param). */
  onSort(sort: TableSort): void {
    this.sort.set(sort);
  }

  onPage(page: number): void {
    this.page.set(page);
    this.reload();
  }

  rowId = (row: ClientResponse): string => row.id;

  /** Row click → the Client Hub (feature 005), the office's one page per client. */
  openHub(row: ClientResponse): void {
    void this.router.navigate(['/crm/clients', row.id]);
  }

  async openAdd(): Promise<void> {
    const ref = this.modal.open<boolean>(AddClientDialogComponent, { size: 'md' });
    if (await ref.afterClosed()) this.reload();
  }

  /**
   * crm-prod FINDING-P2-5: the dialog opens on the stored profile. `GET /clients/{id}` is read first
   * for `maritalStatus` (the list row has none); if that read fails the dialog still opens on the
   * row's job title and representative name, with marital status blank — a blank field is sent as
   * `null`, which the backend keeps (Client.UpdateProfile).
   */
  /** The client whose `GET /clients/{id}` is in flight for Edit (FINDING-P2-17), else null. */
  private editLoadingId: string | null = null;

  private async openEdit(row: ClientResponse): Promise<void> {
    // FINDING-P2-17: one read at a time — a double click (or a second row's Edit) while
    // `GET /clients/{id}` is in flight is ignored, so only one dialog opens.
    if (this.editLoadingId !== null) return;
    this.editLoadingId = row.id;
    let full: ClientResponse | null;
    try {
      full = await firstValueFrom(this.clientsApi.getById(row.id).pipe(catchError(() => of(null))));
    } finally {
      this.editLoadingId = null;
    }
    const data: EditClientDialogData = {
      id: row.id,
      name: `${row.firstName} ${row.lastName}`.trim(),
      initial: {
        jobTitle: full?.jobTitle ?? row.jobTitle ?? null,
        maritalStatus: full?.maritalStatus ?? null,
        representativeName: full?.representativeName ?? row.representativeName ?? null,
      },
    };
    const ref = this.modal.open<boolean>(EditClientDialogComponent, { size: 'md', data });
    if (await ref.afterClosed()) this.reload();
  }

  private async deactivate(row: ClientResponse): Promise<void> {
    const name = `${row.firstName} ${row.lastName}`;
    const ok = await this.confirm.open({
      title: 'Deactivate client',
      body: `${name} will lose portal access until reactivated.`,
      confirmLabel: 'Deactivate',
      tone: 'danger',
    });
    if (!ok) return;
    this.clientsApi.deactivate(row.id).subscribe({
      next: () => {
        this.toast.show({ tone: 'success', message: `${name} deactivated` });
        this.reload();
      },
      error: (err: HttpErrorResponse) =>
        this.toast.show({ tone: 'danger', message: friendly(this.errors.parse(err)) }),
    });
  }

  private async reactivate(row: ClientResponse): Promise<void> {
    const name = `${row.firstName} ${row.lastName}`;
    const ok = await this.confirm.open({
      title: 'Reactivate client',
      body: `${name} will regain portal access.`,
      confirmLabel: 'Reactivate',
    });
    if (!ok) return;
    this.clientsApi.activate(row.id).subscribe({
      next: () => {
        this.toast.show({ tone: 'success', message: `${name} reactivated` });
        this.reload();
      },
      error: (err: HttpErrorResponse) =>
        this.toast.show({ tone: 'danger', message: friendly(this.errors.parse(err)) }),
    });
  }
}

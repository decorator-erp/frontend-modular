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
import { Router } from '@angular/router';
import { Subject } from 'rxjs';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { EmployeeService } from '../../data/employee.service';
import { LookupCache } from '../../data/lookup.cache';
import { ToastService } from '@platform/feedback/toast.service';
import { ErrorHandlerService, friendly } from '@platform/http/error-handler.service';
import { CanDirective, PERM } from '@platform/permissions';
import { EmployeeListItem } from '../../model/employee.model';
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
import { AddEmployeeDialogComponent } from './add-employee-dialog.component';

const PAGE_SIZE = 20;

@Component({
  selector: 'app-employees-list',
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
  templateUrl: './employees-list.component.html',
})
export class EmployeesListComponent implements OnInit {
  private readonly employeesApi = inject(EmployeeService);
  private readonly lookups = inject(LookupCache);
  private readonly modal = inject(ModalService);
  private readonly confirm = inject(ConfirmService);
  private readonly toast = inject(ToastService);
  private readonly errors = inject(ErrorHandlerService);
  private readonly router = inject(Router);

  readonly loading = signal(true);
  readonly all = signal<EmployeeListItem[]>([]);

  // Filters — search/department/role are client-side until the backend grows a SearchTerm param.
  readonly search = signal('');
  readonly departmentId = signal<string | null>(null);
  readonly status = signal<'active' | 'inactive' | 'all'>('active');
  readonly page = signal(1);
  readonly sort = signal<TableSort>({ sortBy: 'fullName', sortDir: 'asc' });

  private readonly searchInput$ = new Subject<string>();

  readonly departmentOptions = signal<SelectOption[]>([{ value: null, label: 'All departments' }]);
  /** departmentId → name, for the column: the employee wire carries no `departmentName`. */
  readonly departmentNames = signal<Map<string, string>>(new Map());
  readonly statusOptions: SelectOption[] = [
    { value: 'active', label: 'Active' },
    { value: 'inactive', label: 'On leave / inactive' },
    { value: 'all', label: 'All' },
  ];

  private readonly avatarTpl = viewChild.required<TemplateRef<unknown>>('avatarTpl');
  private readonly nameTpl = viewChild.required<TemplateRef<unknown>>('nameTpl');
  private readonly departmentTpl = viewChild.required<TemplateRef<unknown>>('departmentTpl');
  private readonly statusTpl = viewChild.required<TemplateRef<unknown>>('statusTpl');

  readonly columns = computed<ColumnDef<EmployeeListItem>[]>(() => [
    { key: 'avatar', header: '', width: 48, template: this.avatarTpl(), hideOnMobile: true },
    { key: 'fullName', header: 'Name', minWidth: 200, sortable: true, template: this.nameTpl() },
    { key: 'email', header: 'Email', minWidth: 200, sortable: true },
    { key: 'jobTitle', header: 'Title', width: 160, sortable: true },
    // No Role column: HR holds no roles and no endpoint returns them for a list of employees.
    {
      key: 'primaryDepartmentId',
      header: 'Department',
      width: 160,
      template: this.departmentTpl(),
    },
    { key: 'isActive', header: 'Status', width: 120, sortable: true, template: this.statusTpl() },
  ]);

  /** Controlled `pera-filter-bar` state; the left rail drives the same three facets. */
  readonly filters = signal<FilterState>({});

  /**
   * The left rail was removed at the T056 gate (user ruling 2026-07-10 — the hubs
   * prototype has no rail). Its per-facet counts were cheap to keep, so they ride
   * along in the dropdown option labels rather than being dropped.
   */
  readonly facets = computed<FilterFacet[]>(() => [
    {
      key: 'departmentId',
      label: 'Department',
      options: this.facetOptions(this.departmentOptions(), (id) => this.departmentCount(id)),
    },
    {
      key: 'status',
      label: 'Status',
      options: this.facetOptions(this.statusOptions, (v) =>
        v === 'active'
          ? this.activeCount()
          : v === 'inactive'
            ? this.inactiveCount()
            : this.all().length,
      ),
    },
  ]);

  private facetOptions(
    options: SelectOption[],
    count?: (value: string) => number,
  ): { value: string; label: string }[] {
    return options
      .filter((o) => o.value !== null && o.value !== undefined)
      .map((o) => {
        const value = String(o.value);
        const n = count?.(value);
        return { value, label: n === undefined ? o.label : `${o.label} (${n})` };
      });
  }

  /**
   * Drafted in 001 and **deliberately unsurfaced**: bulk deactivate is a
   * permission-gated mutation, and `selectable` is never passed, so no selection
   * can reach it (Principle IV, decision D3).
   */
  readonly bulkActions = [
    {
      label: 'Deactivate selected',
      capability: PERM.employees.setActive,
      action: (ids: Set<string>) => this.bulkDeactivate(ids),
    },
  ];

  readonly rowActions: TableRowAction<EmployeeListItem>[] = [
    { label: 'View details', action: (row) => this.openDetail(row) },
    {
      label: 'Deactivate',
      capability: PERM.employees.setActive,
      tone: 'danger',
      visible: (row) => row.isActive,
      action: (row) => this.deactivate(row),
    },
    {
      label: 'Reactivate',
      capability: PERM.employees.setActive,
      visible: (row) => !row.isActive,
      action: (row) => this.reactivate(row),
    },
  ];

  readonly filtered = computed(() => {
    const term = this.search().trim().toLowerCase();
    const dep = this.departmentId();
    let rows = this.all();
    if (term) {
      rows = rows.filter(
        (e) => e.fullName.toLowerCase().includes(term) || e.email.toLowerCase().includes(term),
      );
    }
    if (dep) rows = rows.filter((e) => e.primaryDepartmentId === dep);

    const { sortBy, sortDir } = this.sort();
    const dir = sortDir === 'asc' ? 1 : -1;
    rows = [...rows].sort((a, b) => {
      const av = String((a as unknown as Record<string, unknown>)[sortBy] ?? '');
      const bv = String((b as unknown as Record<string, unknown>)[sortBy] ?? '');
      return av.localeCompare(bv) * dir;
    });
    return rows;
  });

  readonly pageRows = computed(() => {
    const start = (this.page() - 1) * PAGE_SIZE;
    return this.filtered().slice(start, start + PAGE_SIZE);
  });
  readonly totalCount = computed(() => this.filtered().length);
  readonly pageSize = PAGE_SIZE;

  readonly activeCount = computed(() => this.all().filter((e) => e.isActive).length);
  readonly inactiveCount = computed(() => this.all().filter((e) => !e.isActive).length);

  departmentCount(id: string | null): number {
    if (!id) return this.all().length;
    return this.all().filter((e) => e.primaryDepartmentId === id).length;
  }

  /** Department NAME for a row — the wire sends only `primaryDepartmentId`. */
  departmentName(id: string | null): string {
    if (!id) return '';
    return this.departmentNames().get(id) ?? '';
  }

  exportCsv(): void {
    this.toast.show({ tone: 'info', message: 'CSV export coming soon' });
  }

  constructor() {
    this.searchInput$
      .pipe(debounceTime(300), distinctUntilChanged(), takeUntilDestroyed())
      .subscribe((term) => {
        this.search.set(term);
        this.page.set(1);
      });
  }

  ngOnInit(): void {
    this.reload();
    // Departments and roles are session-stable reference data — read them through
    // the shared cache so this screen (and every other consumer) fetches once.
    this.lookups.departments().subscribe((list) => {
      this.departmentOptions.set([
        { value: null, label: 'All departments' },
        ...list.map((d) => ({ value: d.id, label: d.name })),
      ]);
      // The list rows carry only `primaryDepartmentId`, so the name has to be joined here.
      this.departmentNames.set(new Map(list.map((d) => [d.id, d.name])));
    });
    // Roles are no longer read here: HR holds none, and no endpoint returns an employee's roles.
  }

  reload(): void {
    this.loading.set(true);
    const status = this.status();
    this.employeesApi
      .listPaged({
        page: 1,
        // `listPaged` clamps each request to the server's 200 cap and walks forward, so this asks
        // for a whole directory rather than one page; the screen pages the result client-side.
        pageSize: 1000,
        isActive: status === 'all' ? undefined : status === 'active',
        // 006b-2 #10: the server hides inactive employees by default, so *All* and *Inactive*
        // must ask for them; the client narrowing above stays as a fallback.
        includeInactive: status !== 'active',
      })
      .subscribe({
        next: (paged) => {
          this.all.set(paged.items);
          this.loading.set(false);
        },
        error: () => {
          this.all.set([]);
          this.loading.set(false);
        },
      });
  }

  onSearchInput(term: string): void {
    this.searchInput$.next(term);
  }

  private currentFacets(): Record<string, string[]> {
    const facets: Record<string, string[]> = { status: [this.status()] };
    const dep = this.departmentId();
    if (dep) facets['departmentId'] = [dep];
    return facets;
  }

  onFilters(state: FilterState): void {
    const last = (key: string): string | null => state.facets?.[key]?.at(-1) ?? null;
    const status = (last('status') ?? 'active') as 'active' | 'inactive' | 'all';
    const dep = last('departmentId');
    const term = state.search ?? '';

    this.departmentId.set(dep);
    this.page.set(1);

    const statusChanged = status !== this.status();
    if (statusChanged) this.status.set(status);

    // Echo the term straight back so the input never lags a keystroke behind;
    // the reload it triggers is still debounced.
    this.filters.set({ search: term || undefined, facets: this.currentFacets() });

    if (statusChanged) {
      // Status is the one server-side facet: it changes the isActive query.
      this.reload();
      return;
    }
    if (term !== this.search()) this.onSearchInput(term);
  }

  onClearFilters(): void {
    this.search.set('');
    this.departmentId.set(null);
    this.status.set('active');
    this.page.set(1);
    this.filters.set({});
    this.reload();
  }

  onSort(sort: TableSort): void {
    this.sort.set(sort);
  }

  onPage(page: number): void {
    this.page.set(page);
  }

  rowId = (row: EmployeeListItem): string => row.id;

  openDetail(row: EmployeeListItem): void {
    void this.router.navigate(['/employees', row.id]);
  }

  async openAdd(): Promise<void> {
    const ref = this.modal.open<boolean>(AddEmployeeDialogComponent, { size: 'md' });
    if (await ref.afterClosed()) this.reload();
  }

  private async deactivate(row: EmployeeListItem): Promise<void> {
    const ok = await this.confirm.open({
      title: 'Deactivate employee',
      body: `${row.fullName} will lose access to PERA until reactivated.`,
      confirmLabel: 'Deactivate',
      tone: 'danger',
    });
    if (!ok) return;
    this.employeesApi.deactivate(row.id).subscribe({
      next: () => {
        this.toast.show({ tone: 'success', message: `${row.fullName} deactivated` });
        this.reload();
      },
      error: (err: HttpErrorResponse) =>
        this.toast.show({ tone: 'danger', message: friendly(this.errors.parse(err)) }),
    });
  }

  private async reactivate(row: EmployeeListItem): Promise<void> {
    const ok = await this.confirm.open({
      title: 'Reactivate employee',
      body: `${row.fullName} will regain access to PERA.`,
      confirmLabel: 'Reactivate',
    });
    if (!ok) return;
    this.employeesApi.activate(row.id).subscribe({
      next: () => {
        this.toast.show({ tone: 'success', message: `${row.fullName} reactivated` });
        this.reload();
      },
      error: (err: HttpErrorResponse) =>
        this.toast.show({ tone: 'danger', message: friendly(this.errors.parse(err)) }),
    });
  }

  private async bulkDeactivate(ids: Set<string>): Promise<void> {
    const ok = await this.confirm.open({
      title: `Deactivate ${ids.size} employees`,
      body: 'Selected employees will lose access to PERA until reactivated.',
      confirmLabel: 'Deactivate all',
      tone: 'danger',
    });
    if (!ok) return;
    let done = 0;
    ids.forEach((id) =>
      this.employeesApi.deactivate(id).subscribe({
        next: () => {
          if (++done === ids.size) {
            this.toast.show({ tone: 'success', message: `${ids.size} employees deactivated` });
            this.reload();
          }
        },
      }),
    );
  }
}

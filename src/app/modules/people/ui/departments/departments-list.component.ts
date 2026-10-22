import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { switchMap } from 'rxjs/operators';
import { DepartmentService } from '../../data/department.service';
import { ErrorHandlerService, friendly } from '@platform/http/error-handler.service';
import { ToastService } from '@platform/feedback/toast.service';
import { CanDirective, PERM } from '@platform/permissions';
import { DepartmentResponse, EmployeeListResponse } from '../../model/people.model';
import { EmployeeService } from '../../data/employee.service';
import {
  ConfirmService,
  ModalService,
  PeraAvatarComponent,
  PeraBadgeComponent,
  PeraButtonComponent,
  PeraCardComponent,
  PeraEmptyComponent,
  PeraPageHeaderComponent,
  PeraSkeletonComponent,
  PeraTabsComponent,
  SelectOption,
  TabDef,
} from '@ds';
import {
  DepartmentFormDialogComponent,
  DepartmentFormDialogData,
} from './department-form-dialog.component';
import { PickEmployeeDialogComponent } from './pick-employee-dialog.component';

@Component({
  selector: 'app-departments-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CanDirective,
    PeraAvatarComponent,
    PeraButtonComponent,
    PeraEmptyComponent,
    PeraPageHeaderComponent,
    PeraSkeletonComponent,
  ],
  templateUrl: './departments-list.component.html',
})
export class DepartmentsListComponent implements OnInit {
  private readonly api = inject(DepartmentService);
  private readonly directory = inject(EmployeeService);
  private readonly modal = inject(ModalService);
  private readonly confirm = inject(ConfirmService);
  private readonly toast = inject(ToastService);
  private readonly errors = inject(ErrorHandlerService);

  /** Exposed for the template's `*peraCan` gates. */
  readonly PERM = PERM;

  readonly loading = signal(true);
  readonly departments = signal<DepartmentResponse[]>([]);
  readonly selectedId = signal<string | null>(null);
  readonly members = signal<EmployeeListResponse[]>([]);
  readonly membersLoading = signal(false);

  readonly activeTab = signal('list');
  readonly tabs: TabDef[] = [
    { id: 'list', label: 'List view' },
    { id: 'org', label: 'Org chart' },
  ];

  readonly selected = computed(
    () => this.departments().find((d) => d.id === this.selectedId()) ?? null,
  );

  /**
   * employeeId → full name, for resolving `departmentHeadId`.
   *
   * The wire gives the head as a bare id, so the name has to be joined. One directory read covers
   * every row; there is no per-department head endpoint to call instead.
   */
  private readonly employeeNames = signal<Map<string, string>>(new Map());
  /** Candidates for the "assign head" picker. */
  readonly employeeOptions = signal<SelectOption[]>([]);

  /** The single wording for "this department has no head" — there used to be three. */
  readonly NO_HEAD = 'No head assigned';

  ngOnInit(): void {
    this.load();
    this.directory.listPaged({ pageSize: 1000, isActive: true }).subscribe({
      next: (paged) => {
        this.employeeNames.set(new Map(paged.items.map((e) => [e.id, e.fullName])));
        this.employeeOptions.set(paged.items.map((e) => ({ value: e.id, label: e.fullName })));
      },
      error: () => undefined,
    });
  }

  private load(selectId?: string): void {
    this.api.getAll().subscribe({
      next: (list) => {
        this.departments.set(list);
        this.loading.set(false);
        const toSelect = (selectId && list.find((d) => d.id === selectId)) || list[0];
        if (toSelect) this.select(toSelect);
      },
      error: () => this.loading.set(false),
    });
  }

  async openCreate(): Promise<void> {
    const ref = this.modal.open<boolean>(DepartmentFormDialogComponent, { size: 'sm' });
    if (await ref.afterClosed()) this.load();
  }

  async openEdit(d: DepartmentResponse): Promise<void> {
    const data: DepartmentFormDialogData = {
      id: d.id,
      currentName: d.name,
      currentDescription: d.description,
    };
    const ref = this.modal.open<boolean>(DepartmentFormDialogComponent, { size: 'sm', data });
    if (await ref.afterClosed()) this.load(d.id);
  }

  select(d: DepartmentResponse): void {
    this.selectedId.set(d.id);
    this.membersLoading.set(true);
    this.api.getMembers(d.id).subscribe({
      next: (list) => {
        this.members.set(list);
        this.membersLoading.set(false);
      },
      error: () => {
        this.members.set([]);
        this.membersLoading.set(false);
      },
    });
  }

  /**
   * The head's name, straight from the list response (backend v3 `headName`, 006b-2 #22): no join
   * against the directory, no per-department request.
   */
  headName(d: DepartmentResponse): string {
    if (!d.departmentHeadId) return this.NO_HEAD;
    return d.headName ?? this.NO_HEAD;
  }

  hasHead(d: DepartmentResponse): boolean {
    return Boolean(d.departmentHeadId);
  }

  /**
   * Assign or reassign the head.
   *
   * Assign is NOT an upsert — it 400s with `departments.AlreadyHaveHead` when one is set — so a
   * reassignment unassigns first. That is two writes with a window between them; if the second
   * fails the department is left headless, which the toast says plainly.
   */
  async assignHead(d: DepartmentResponse): Promise<void> {
    const employeeId = await this.pickEmployee(d);
    if (!employeeId) return;

    const call = d.departmentHeadId
      ? this.api.removeHead(d.id).pipe(switchMap(() => this.api.assignHead(d.id, employeeId)))
      : this.api.assignHead(d.id, employeeId);

    call.subscribe({
      next: () => {
        this.toast.show({
          tone: 'success',
          message: `${this.employeeNames().get(employeeId) ?? 'Employee'} now heads ${d.name}`,
        });
        this.load(d.id);
      },
      error: (err: HttpErrorResponse) => {
        this.toast.show({ tone: 'danger', message: friendly(this.errors.parse(err)) });
        this.load(d.id);
      },
    });
  }

  async removeHead(d: DepartmentResponse): Promise<void> {
    const ok = await this.confirm.open({
      title: 'Unassign department head',
      body: `${this.headName(d)} will no longer head ${d.name}. They stay a member of the department.`,
      confirmLabel: 'Unassign',
      tone: 'danger',
    });
    if (!ok) return;
    this.api.removeHead(d.id).subscribe({
      next: () => {
        this.toast.show({ tone: 'success', message: `Head unassigned from ${d.name}` });
        this.load(d.id);
      },
      error: (err: HttpErrorResponse) =>
        this.toast.show({ tone: 'danger', message: friendly(this.errors.parse(err)) }),
    });
  }

  private async pickEmployee(d: DepartmentResponse): Promise<string | null> {
    const ref = this.modal.open<string | null>(PickEmployeeDialogComponent, {
      size: 'sm',
      data: {
        title: d.departmentHeadId ? `Change head of ${d.name}` : `Assign head of ${d.name}`,
        options: this.employeeOptions(),
      },
    });
    return (await ref.afterClosed()) ?? null;
  }
}

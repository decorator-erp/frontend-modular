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
import { RouterLink } from '@angular/router';
import { forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { RoleService } from '../../data/role.service';
import { LookupCache } from '../../data/lookup.cache';
import { PermissionService } from '../../data/permission.service';
import { ToastService } from '@platform/feedback/toast.service';
import { ErrorHandlerService, friendly } from '@platform/http/error-handler.service';
import { CanDirective, PERM } from '@platform/permissions';
import { RoleResponse } from '../../model/people.model';
import { EmployeeService } from '../../data/employee.service';
import { EmployeeListItem } from '../../model/employee.model';
import {
  ColumnDef,
  ConfirmService,
  ModalService,
  PeraAvatarComponent,
  PeraBadgeComponent,
  PeraButtonComponent,
  PeraEmptyComponent,
  PeraPageHeaderComponent,
  PeraSkeletonComponent,
  TableRowAction,
} from '@ds';
import { AssignRoleDialogComponent } from './assign-role-dialog.component';
import { RoleNameDialogComponent } from './role-name-dialog.component';

@Component({
  selector: 'app-roles',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    CanDirective,
    PeraAvatarComponent,
    PeraBadgeComponent,
    PeraButtonComponent,
    PeraEmptyComponent,
    PeraPageHeaderComponent,
    PeraSkeletonComponent,
  ],
  templateUrl: './roles.component.html',
})
export class RolesComponent implements OnInit {
  private readonly rolesApi = inject(RoleService);
  private readonly lookups = inject(LookupCache);
  private readonly permissionsApi = inject(PermissionService);
  private readonly directory = inject(EmployeeService);
  private readonly modal = inject(ModalService);
  private readonly confirm = inject(ConfirmService);
  private readonly toast = inject(ToastService);
  private readonly errors = inject(ErrorHandlerService);

  readonly loading = signal(true);
  readonly roles = signal<RoleResponse[]>([]);
  readonly selected = signal<RoleResponse | null>(null);

  readonly detailLoading = signal(false);
  readonly members = signal<EmployeeListItem[]>([]);
  readonly permissionCount = signal<number | null>(null);
  readonly memberCounts = signal<Map<string, number>>(new Map());

  private readonly nameTpl = viewChild.required<TemplateRef<unknown>>('nameTpl');
  private readonly membersTpl = viewChild.required<TemplateRef<unknown>>('membersTpl');
  private readonly statusTpl = viewChild.required<TemplateRef<unknown>>('statusTpl');

  readonly columns = computed<ColumnDef<RoleResponse>[]>(() => [
    {
      key: 'name',
      header: 'Role name',
      minWidth: 200,
      sortable: true,
      template: this.nameTpl(),
    },
    { key: 'memberCount', header: 'Members', width: 100, template: this.membersTpl() },
    { key: 'isActive', header: 'Status', width: 120, template: this.statusTpl() },
  ]);

  readonly rowActions: TableRowAction<RoleResponse>[] = [
    {
      label: 'Edit role',
      capability: PERM.roles.update,
      action: (row) => this.openRename(row),
    },
    {
      label: 'Assign to user',
      capability: PERM.roles.assignToUser,
      action: (row) => this.openAssign(row),
    },
    {
      label: 'Delete',
      capability: PERM.roles.delete,
      tone: 'danger',
      action: (row) => this.remove(row),
    },
  ];

  ngOnInit(): void {
    this.reload();
  }

  reload(): void {
    this.loading.set(true);
    this.rolesApi.getAll().subscribe({
      next: (list) => {
        this.roles.set(list);
        this.loading.set(false);
        const current = this.selected();
        if (current && !list.some((r) => r.id === current.id)) this.selected.set(null);
        if (!this.selected() && list.length > 0) this.select(list[0]);
      },
      error: () => {
        this.roles.set([]);
        this.loading.set(false);
      },
    });
  }

  select(role: RoleResponse): void {
    this.selected.set(role);
    this.detailLoading.set(true);
    forkJoin({
      members: this.directory.byRole(role.id).pipe(catchError(() => of(null))),
      permissions: this.permissionsApi.getRolePermissions(role.id).pipe(catchError(() => of(null))),
    }).subscribe(({ members, permissions }) => {
      this.members.set(members?.items ?? []);
      this.permissionCount.set(permissions ? permissions.length : null);
      if (members) {
        this.memberCounts.update((m) => new Map(m).set(role.id, members.totalCount));
      }
      this.detailLoading.set(false);
    });
  }

  memberCountOf(role: RoleResponse): string {
    const count = this.memberCounts().get(role.id);
    return count === undefined ? '—' : String(count);
  }

  async openCreate(): Promise<void> {
    const ref = this.modal.open<boolean>(RoleNameDialogComponent, { size: 'sm' });
    if (await ref.afterClosed()) this.reload();
  }

  async openRename(role: RoleResponse): Promise<void> {
    const ref = this.modal.open<boolean>(RoleNameDialogComponent, {
      size: 'sm',
      // The description must go BOTH ways: `UpdateRoleRequest` persists whatever it receives, so
      // sending only the name nulls the stored description on every rename.
      data: { roleId: role.id, currentName: role.name, currentDescription: role.description },
    });
    if (await ref.afterClosed()) this.reload();
  }

  async openAssign(role: RoleResponse): Promise<void> {
    const ref = this.modal.open<boolean>(AssignRoleDialogComponent, {
      size: 'md',
      data: { roleId: role.id, roleName: role.name },
    });
    if ((await ref.afterClosed()) && this.selected()?.id === role.id) this.select(role);
  }

  async remove(role: RoleResponse): Promise<void> {
    const ok = await this.confirm.open({
      title: 'Delete role',
      body: `“${role.name}” will be removed from every employee holding it. This cannot be undone.`,
      confirmLabel: 'Delete role',
      tone: 'danger',
    });
    if (!ok) return;
    this.rolesApi.deleteRole(role.id).subscribe({
      next: () => {
        this.lookups.invalidateRoles();
        this.toast.show({ tone: 'success', message: `Role ${role.name} deleted` });
        if (this.selected()?.id === role.id) this.selected.set(null);
        this.reload();
      },
      error: (err: HttpErrorResponse) =>
        this.toast.show({ tone: 'danger', message: friendly(this.errors.parse(err)) }),
    });
  }
}

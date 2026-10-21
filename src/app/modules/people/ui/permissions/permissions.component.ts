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
import { RouterLink } from '@angular/router';
import { forkJoin, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { PermissionService } from '../../data/permission.service';
import { RoleService } from '../../data/role.service';
import { ToastService } from '@platform/feedback/toast.service';
import { ErrorHandlerService, friendly } from '@platform/http/error-handler.service';
import { CanDirective, PERM, PermissionsService } from '@platform/permissions';
import {
  EffectivePermissionsResponse,
  ModulePermissionSet,
  RoleResponse,
} from '../../model/people.model';
import { EmployeeService } from '../../data/employee.service';
import { EmployeeListItem } from '../../model/employee.model';
import { FULL_ACCESS_REASON, isFullAccessRole } from '../roles/role-policy';
import { AuthStore } from '@platform/auth/auth.store';
import { formatLongDate } from '@shared/ui/status';
import { LocaleService } from '@platform/i18n';
import {
  ConfirmService,
  ModalService,
  PeraAvatarComponent,
  PeraBadgeComponent,
  PeraButtonComponent,
  PeraCardComponent,
  PeraEmptyComponent,
  PeraInputComponent,
  PeraPageHeaderComponent,
  PeraSkeletonComponent,
  PeraTooltipDirective,
} from '@ds';
import { NewOverrideDialogComponent } from './new-override-dialog.component';
import { PermissionRow, permissionDisplayName } from './permission-row';

interface PermissionGroup {
  group: string;
  permissions: PermissionRow[];
}

/** Flatten the server catalog into matrix rows, one per permission, grouped by its module. */
function toRows(sets: ModulePermissionSet[]): PermissionRow[] {
  return sets.flatMap((set) =>
    set.permissions.map((value) => ({
      value,
      group: set.module || 'Other',
      displayName: permissionDisplayName(value),
    })),
  );
}

@Component({
  selector: 'app-permissions',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    RouterLink,
    CanDirective,
    PeraAvatarComponent,
    PeraButtonComponent,
    PeraEmptyComponent,
    PeraPageHeaderComponent,
    PeraSkeletonComponent,
    PeraTooltipDirective,
  ],
  templateUrl: './permissions.component.html',
})
export class PermissionsComponent implements OnInit {
  private readonly permissionsApi = inject(PermissionService);
  private readonly rolesApi = inject(RoleService);
  private readonly directory = inject(EmployeeService);
  private readonly perms = inject(PermissionsService);
  private readonly modal = inject(ModalService);
  private readonly confirm = inject(ConfirmService);
  private readonly toast = inject(ToastService);
  private readonly errors = inject(ErrorHandlerService);
  readonly locale = inject(LocaleService);
  private readonly authStore = inject(AuthStore);

  readonly loading = signal(true);
  /** True when the catalog read itself failed — 403 for anyone without `permissions.manage`. */
  readonly catalogFailed = signal(false);
  readonly allPermissions = signal<PermissionRow[]>([]);
  readonly roles = signal<RoleResponse[]>([]);
  /** roleId → set of permission strings (`claimValue`) the role holds. */
  readonly roleGrants = signal<Map<string, Set<string>>>(new Map());
  /** Cells with an in-flight request: `${roleId}:${permission}`. */
  readonly pending = signal<Set<string>>(new Set());

  readonly search = signal('');
  readonly hiddenRoles = signal<Set<string>>(new Set());

  // Per-user overrides
  readonly userSearch = signal('');
  readonly userResults = signal<EmployeeListItem[]>([]);
  readonly selectedUser = signal<EmployeeListItem | null>(null);
  readonly effective = signal<EffectivePermissionsResponse | null>(null);
  readonly effectiveLoading = signal(false);
  private allEmployees: EmployeeListItem[] = [];

  /**
   * Grant, deny AND revoke on your own account all answer 403 `permissions.SelfModification`
   * (006b-1 #7), so they are disabled rather than offered.
   */
  readonly isSelfTarget = computed(
    () => !!this.selectedUser() && this.selectedUser()?.userId === this.authStore.user()?.userId,
  );
  readonly selfTargetReason = 'This is your own account. Ask another administrator.';

  readonly canEdit = computed(() =>
    this.perms.can([PERM.permissions.assignToRole, PERM.permissions.removeFromRole]),
  );

  readonly visibleRoles = computed(() => this.roles().filter((r) => !this.hiddenRoles().has(r.id)));

  /** A failed claim write the server explained (403 `permissions.CannotDelegate`), shown inline. */
  readonly matrixError = signal<string | null>(null);
  readonly fullAccessReason = FULL_ACCESS_REASON;

  /** Full-access roles always hold everything; PUT and DELETE of a claim answer 409. */
  isLocked(role: RoleResponse): boolean {
    return isFullAccessRole(role.name);
  }

  cellDisabled(role: RoleResponse, permission: string): boolean {
    return !this.canEdit() || this.isLocked(role) || this.isPending(role.id, permission);
  }

  readonly groups = computed<PermissionGroup[]>(() => {
    const term = this.search().trim().toLowerCase();
    const byGroup = new Map<string, Map<string, PermissionRow>>();
    for (const permission of this.allPermissions()) {
      if (
        term &&
        !permission.displayName.toLowerCase().includes(term) &&
        !permission.value.toLowerCase().includes(term)
      ) {
        continue;
      }
      const key = permission.group || 'Other';
      if (!byGroup.has(key)) byGroup.set(key, new Map());
      // Dedupe by the permission string within the group — a module may declare the same
      // permission more than once, and two rows for one claim would toggle each other.
      const bucket = byGroup.get(key)!;
      if (!bucket.has(permission.value)) bucket.set(permission.value, permission);
    }
    return [...byGroup.entries()]
      .map(([group, bucket]) => ({
        group,
        permissions: [...bucket.values()].sort((a, b) =>
          a.displayName.localeCompare(b.displayName),
        ),
      }))
      .sort((a, b) => a.group.localeCompare(b.group));
  });

  readonly longDate = formatLongDate;

  ngOnInit(): void {
    forkJoin({
      permissions: this.permissionsApi.getAll(),
      roles: this.rolesApi.getAll(),
    }).subscribe({
      next: ({ permissions, roles }) => {
        this.allPermissions.set(toRows(permissions));
        this.roles.set(roles);
        this.loadGrants(roles);
      },
      error: () => {
        // `GET /api/permissions` requires `permissions.manage`. Say so rather than rendering an
        // empty matrix, which reads as "this role has no permissions" — the opposite of the truth.
        this.catalogFailed.set(true);
        this.loading.set(false);
      },
    });

    this.directory.listPaged({ page: 1, pageSize: 500, isActive: true }).subscribe((paged) => {
      this.allEmployees = paged.items;
    });
  }

  private loadGrants(roles: RoleResponse[]): void {
    if (roles.length === 0) {
      this.loading.set(false);
      return;
    }
    forkJoin(
      roles.map((role) =>
        this.permissionsApi.getRolePermissions(role.id).pipe(
          // Match on `claimValue` — the permission string. `PermissionResponse` no longer carries
          // an `id` or a `name` to key on.
          map((list) => [role.id, new Set(list.map((p) => p.claimValue))] as const),
          catchError(() => of([role.id, new Set<string>()] as const)),
        ),
      ),
    ).subscribe((entries) => {
      this.roleGrants.set(new Map(entries));
      this.loading.set(false);
    });
  }

  has(roleId: string, permission: string): boolean {
    return this.roleGrants().get(roleId)?.has(permission) ?? false;
  }

  isPending(roleId: string, permission: string): boolean {
    return this.pending().has(`${roleId}:${permission}`);
  }

  toggleRoleVisibility(roleId: string): void {
    this.hiddenRoles.update((set) => {
      const next = new Set(set);
      next.has(roleId) ? next.delete(roleId) : next.add(roleId);
      return next;
    });
  }

  toggle(role: RoleResponse, permission: PermissionRow): void {
    if (!this.canEdit() || this.isLocked(role) || this.isPending(role.id, permission.value)) return;
    this.matrixError.set(null);
    const key = `${role.id}:${permission.value}`;
    const had = this.has(role.id, permission.value);

    // Optimistic flip, revert on error.
    this.setGrant(role.id, permission.value, !had);
    this.pending.update((s) => new Set(s).add(key));

    const call = had
      ? this.permissionsApi.removeFromRole(role.id, permission.value)
      : this.permissionsApi.assignToRole(role.id, permission.value);

    call.subscribe({
      next: () => {
        this.pending.update((s) => {
          const next = new Set(s);
          next.delete(key);
          return next;
        });
      },
      error: (err: HttpErrorResponse) => {
        this.setGrant(role.id, permission.value, had);
        this.pending.update((s) => {
          const next = new Set(s);
          next.delete(key);
          return next;
        });
        const parsed = this.errors.parse(err);
        if (parsed.code === 'permissions.CannotDelegate') {
          // The server's description names the permissions the caller lacks.
          this.matrixError.set(parsed.generalMessage || friendly(parsed));
          return;
        }
        this.toast.show({
          tone: 'danger',
          message: `Couldn't ${had ? 'revoke' : 'grant'} ${permission.displayName} for ${role.name}`,
        });
      },
    });
  }

  private setGrant(roleId: string, permission: string, granted: boolean): void {
    this.roleGrants.update((grants) => {
      const next = new Map(grants);
      const set = new Set(next.get(roleId) ?? []);
      granted ? set.add(permission) : set.delete(permission);
      next.set(roleId, set);
      return next;
    });
  }

  // ---- per-user overrides ----------------------------------------------------

  onUserSearch(term: string): void {
    this.userSearch.set(term);
    const t = term.trim().toLowerCase();
    if (!t) {
      this.userResults.set([]);
      return;
    }
    this.userResults.set(
      this.allEmployees
        .filter((e) => e.fullName.toLowerCase().includes(t) || e.email.toLowerCase().includes(t))
        .slice(0, 8),
    );
  }

  pickUser(user: EmployeeListItem): void {
    this.selectedUser.set(user);
    this.userSearch.set('');
    this.userResults.set([]);
    this.loadEffective(user.userId);
  }

  private loadEffective(userId: string): void {
    this.effectiveLoading.set(true);
    this.permissionsApi.getUserEffective(userId).subscribe({
      next: (response) => {
        this.effective.set(response);
        this.effectiveLoading.set(false);
      },
      error: () => {
        this.effective.set(null);
        this.effectiveLoading.set(false);
      },
    });
  }

  async openNewOverride(): Promise<void> {
    const user = this.selectedUser();
    if (!user || this.isSelfTarget()) return;
    const ref = this.modal.open<boolean>(NewOverrideDialogComponent, {
      size: 'sm',
      data: {
        targetUserId: user.userId,
        targetName: user.fullName,
        permissions: this.allPermissions(),
        existing: this.effective()?.overrides ?? [],
      },
    });
    if (await ref.afterClosed()) this.loadEffective(user.userId);
  }

  async revokeOverride(permission: string): Promise<void> {
    const user = this.selectedUser();
    if (!user || this.isSelfTarget()) return;
    const ok = await this.confirm.open({
      title: 'Revoke override',
      body: `Remove the ${permission} override for ${user.fullName}?`,
      confirmLabel: 'Revoke',
      tone: 'danger',
    });
    if (!ok) return;
    this.permissionsApi.revoke({ targetUserId: user.userId, permission }).subscribe({
      next: () => {
        this.toast.show({ tone: 'success', message: 'Override revoked' });
        this.loadEffective(user.userId);
      },
      error: (err: HttpErrorResponse) =>
        this.toast.show({ tone: 'danger', message: friendly(this.errors.parse(err)) }),
    });
  }
}

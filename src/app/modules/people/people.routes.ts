import { Routes } from '@angular/router';
import { PermissionGuard } from '@platform/auth/permission.guard';

/**
 * The six people routes, children of the office shell. Each object is the old `app.routes.ts`
 * entry at SOURCE_SHA, byte-for-byte except the `loadComponent` path (spec 006; metadata verbatim
 * from the 004 stubs, raw permission strings kept — 010 normalizes). Old order, old guards.
 */
export const peopleRoutes: Routes = [
  {
    path: 'profile',
    loadComponent: () => import('./ui/profile/profile.component').then((m) => m.ProfileComponent),
    data: { breadcrumb: 'Profile' },
  },
  {
    path: 'employees',
    canActivate: [PermissionGuard],
    data: { permission: 'employees.read', breadcrumb: 'Employees' },
    loadComponent: () =>
      import('./ui/employees/employees-list.component').then((m) => m.EmployeesListComponent),
  },
  {
    path: 'employees/:id',
    canActivate: [PermissionGuard],
    data: { permission: 'employees.read', breadcrumb: 'Employee' },
    loadComponent: () =>
      import('./ui/employees/employee-detail.component').then((m) => m.EmployeeDetailComponent),
  },
  {
    path: 'roles',
    canActivate: [PermissionGuard],
    data: { permission: 'roles.read', breadcrumb: 'Roles' },
    loadComponent: () => import('./ui/roles/roles.component').then((m) => m.RolesComponent),
  },
  {
    path: 'permissions',
    canActivate: [PermissionGuard],
    // UI-1: the role matrix needs roles.read, the per-user overrides need permissions.manage —
    // either opens the page, which shows only the part the caller may use.
    data: { permission: ['permissions.manage', 'roles.read'], breadcrumb: 'Permissions' },
    loadComponent: () =>
      import('./ui/permissions/permissions.component').then((m) => m.PermissionsComponent),
  },
  {
    path: 'departments',
    canActivate: [PermissionGuard],
    data: { permission: 'departments.read', breadcrumb: 'Departments' },
    loadComponent: () =>
      import('./ui/departments/departments-list.component').then((m) => m.DepartmentsListComponent),
  },
];

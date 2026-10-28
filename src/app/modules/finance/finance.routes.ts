import { Routes } from '@angular/router';
import { PermissionGuard } from '@platform/auth/permission.guard';
import { PERM } from '@platform/permissions';

/**
 * `/finance` routes. Lists, forms, and detail pages all wired.
 */
export const financeRoutes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    canActivate: [PermissionGuard],
    data: { permission: PERM.finance.read, breadcrumb: 'Finance' },
    loadComponent: () =>
      import('./ui/studio-dashboard.component').then((m) => m.FinanceStudioDashboardComponent),
  },
  {
    path: 'cost-categories',
    canActivate: [PermissionGuard],
    data: { permission: PERM.finance.read, breadcrumb: 'Cost categories' },
    loadComponent: () =>
      import('./ui/cost-categories/cost-categories-list.component').then(
        (m) => m.CostCategoriesListComponent,
      ),
  },
  {
    path: 'projects/:projectId',
    canActivate: [PermissionGuard],
    data: { permission: PERM.finance.read, breadcrumb: 'Dashboard' },
    loadComponent: () =>
      import('./ui/project-dashboard/project-financial-dashboard.component').then(
        (m) => m.ProjectFinancialDashboardComponent,
      ),
  },
  {
    path: 'projects/:projectId/summary',
    canActivate: [PermissionGuard],
    data: { permission: PERM.finance.read, breadcrumb: 'Summary' },
    loadComponent: () =>
      import('./ui/project-dashboard/project-financial-summary.component').then(
        (m) => m.ProjectFinancialSummaryComponent,
      ),
  },

  // Budget
  {
    path: 'projects/:projectId/budget',
    canActivate: [PermissionGuard],
    data: { permission: PERM.finance.read, breadcrumb: 'Budget' },
    loadComponent: () =>
      import('./ui/budget-lines/budget-lines-list.component').then(
        (m) => m.BudgetLinesListComponent,
      ),
  },

  // Ledger
  {
    path: 'projects/:projectId/ledger',
    canActivate: [PermissionGuard],
    data: { permission: PERM.finance.read, breadcrumb: 'Ledger' },
    loadComponent: () =>
      import('./ui/ledger/ledger-list.component').then((m) => m.LedgerListComponent),
  },
  {
    path: 'projects/:projectId/ledger/new',
    canActivate: [PermissionGuard],
    data: { permission: PERM.finance.recordPayment, breadcrumb: 'Post entry' },
    loadComponent: () =>
      import('./ui/ledger/ledger-post.component').then((m) => m.LedgerPostComponent),
  },

  // Invoices
  {
    path: 'projects/:projectId/invoices',
    canActivate: [PermissionGuard],
    data: { permission: PERM.finance.read, breadcrumb: 'Invoices' },
    loadComponent: () =>
      import('./ui/invoices/invoices-list.component').then((m) => m.InvoicesListComponent),
  },
  {
    path: 'projects/:projectId/invoices/new',
    canActivate: [PermissionGuard],
    data: { permission: PERM.finance.manageInvoice, breadcrumb: 'New invoice' },
    loadComponent: () =>
      import('./ui/invoices/invoice-form.component').then((m) => m.InvoiceFormComponent),
  },
  {
    path: 'projects/:projectId/invoices/:id',
    canActivate: [PermissionGuard],
    data: { permission: PERM.finance.read, breadcrumb: 'Invoice' },
    loadComponent: () =>
      import('./ui/invoices/invoice-detail.component').then((m) => m.InvoiceDetailComponent),
  },

  // Variations
  {
    path: 'projects/:projectId/variations',
    canActivate: [PermissionGuard],
    data: { permission: PERM.finance.read, breadcrumb: 'Variations' },
    loadComponent: () =>
      import('./ui/variations/variations-list.component').then((m) => m.VariationsListComponent),
  },
  {
    path: 'projects/:projectId/variations/:id',
    canActivate: [PermissionGuard],
    data: { permission: PERM.finance.read, breadcrumb: 'Variation' },
    loadComponent: () =>
      import('./ui/variations/variation-detail.component').then((m) => m.VariationDetailComponent),
  },

  // BOQ
  {
    path: 'projects/:projectId/boq',
    canActivate: [PermissionGuard],
    data: { permission: PERM.finance.read, breadcrumb: 'BOQ snapshots' },
    loadComponent: () => import('./ui/boq/boq-list.component').then((m) => m.BoqListComponent),
  },
  {
    path: 'projects/:projectId/boq/:id',
    canActivate: [PermissionGuard],
    data: { permission: PERM.finance.read, breadcrumb: 'Snapshot' },
    loadComponent: () =>
      import('./ui/shared/placeholder.component').then((m) => m.FinancePlaceholderComponent),
    resolve: { title: () => 'BOQ snapshot' },
  },
];

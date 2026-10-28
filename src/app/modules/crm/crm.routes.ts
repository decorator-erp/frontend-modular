import { Routes } from '@angular/router';
import { PermissionGuard } from '@platform/auth/permission.guard';
import { PERM } from '@platform/permissions';
import { ItemsStore } from './stores/items.store';
import { LeadDetailStore } from './stores/lead-detail.store';
import { PeriodStore } from './stores/period.store';
import { SpacesStore } from './stores/spaces.store';

/**
 * CRM — client requirement gathering (feature 004) and the Client Hub (feature 005).
 *
 * Lazy, following the `finance` precedent (the repo's only other `loadChildren`).
 * The old single broad CRM read parent gate was retired in the permission-granularity
 * refactor; each child now carries its own granular read guard so a caller holding
 * only one sub-permission still reaches the screens it is entitled to.
 */
export const crmRoutes: Routes = [
  {
    path: 'leads',
    canActivate: [PermissionGuard],
    data: { permission: PERM.crm.leads.read },
    loadComponent: () =>
      import('./ui/leads/leads-list.component').then((m) => m.CrmLeadsListComponent),
  },
  {
    path: 'my-work',
    canActivate: [PermissionGuard],
    data: { permission: PERM.crm.designProfile.read },
    loadComponent: () => import('./ui/my-work/my-work.component').then((m) => m.CrmMyWorkComponent),
  },
  {
    path: 'leads/:leadId',
    canActivate: [PermissionGuard],
    data: { permission: PERM.crm.leads.read },
    providers: [LeadDetailStore],
    loadComponent: () =>
      import('./ui/leads/lead-detail.component').then((m) => m.CrmLeadDetailComponent),
  },
  {
    path: 'clients/:clientId',
    canActivate: [PermissionGuard],
    data: { permission: PERM.clients.read },
    loadComponent: () => import('./ui/hub/client-hub.component').then((m) => m.ClientHubComponent),
  },
  {
    path: 'projects/:projectId',
    canActivate: [PermissionGuard],
    // The topbar keeps the deepest label, so this replaces the bare "CRM" crumb.
    data: { permission: PERM.crm.periods.read, breadcrumb: 'Requirement gathering' },
    loadComponent: () =>
      import('./ui/dashboard/crm-dashboard.component').then((m) => m.CrmDashboardComponent),
  },
  {
    path: 'projects/:projectId/scheduler',
    canActivate: [PermissionGuard],
    data: { permission: PERM.crm.meetings.read },
    loadComponent: () =>
      import('./ui/scheduler/crm-scheduler.component').then((m) => m.CrmSchedulerComponent),
  },
  {
    path: 'projects/:projectId/brief',
    canActivate: [PermissionGuard],
    data: { permission: PERM.crm.briefs.read },
    loadComponent: () =>
      import('./ui/brief/crm-brief-page.component').then((m) => m.CrmBriefPageComponent),
  },
  {
    path: 'projects/:projectId/items',
    canActivate: [PermissionGuard],
    data: { permission: PERM.crm.items.read },
    // Providers moved from the component decorator to the route (feature 005): the
    // Client Hub's Gathering tab embeds this same component with its OWN ancestor
    // providers of the same store classes, so the component itself can no longer own them.
    providers: [ItemsStore, PeriodStore],
    loadComponent: () =>
      import('./ui/items/items-board.component').then((m) => m.CrmItemsBoardComponent),
  },
  {
    // Declared before the bare `spaces` and `spaces/provisioning` routes, same reasoning
    // as `/provisioning` already being declared ahead of `spaces` — the more specific path
    // first. A fresh `SpacesStore` per route, same as every other spaces sub-route; the
    // storefront calls `load()` itself, same entry point `spaces-page.component.ts` uses.
    path: 'projects/:projectId/spaces/:spaceId/record',
    canActivate: [PermissionGuard],
    data: { permission: PERM.crm.spaces.manage },
    providers: [SpacesStore],
    loadComponent: () =>
      import('./ui/spaces/storefront-page.component').then((m) => m.CrmStorefrontPageComponent),
  },
  {
    path: 'projects/:projectId/spaces/provisioning',
    canActivate: [PermissionGuard],
    data: { permission: PERM.crm.spaces.read },
    providers: [SpacesStore],
    loadComponent: () =>
      import('./ui/spaces/provisioning-page.component').then((m) => m.CrmProvisioningPageComponent),
  },
  {
    path: 'projects/:projectId/spaces',
    canActivate: [PermissionGuard],
    data: { permission: PERM.crm.spaces.read },
    providers: [SpacesStore],
    loadComponent: () =>
      import('./ui/spaces/spaces-page.component').then((m) => m.CrmSpacesPageComponent),
  },
];

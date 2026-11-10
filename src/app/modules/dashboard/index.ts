// The dashboard barrel (DB-1). The page is reached only through this lazy loader, so nothing from
// the dashboard (or the module barrels it reads) enters the initial bundle.

// app.routes.ts — the `dashboard` route.
export const loadDashboardPage = () =>
  import('./ui/dashboard-page.component').then((m) => m.DashboardPageComponent);

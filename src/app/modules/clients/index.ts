// The clients barrel: only what a foreign consumer needs (charter §3; spec 005). Each export names
// its consumer. Future consumers, from the old app at SOURCE_SHA, are listed in reports/005-report.md.

// app.routes.ts: `clients` is a single-page module, routed through its barrel (spec 005 recipe 3).
export { ClientsListComponent } from './ui/clients-list.component';

// Future: crm (stores/client-hub.store), projects (project-create, projects-list).
export { ClientService } from './data/client.service';

// Future: crm (leads/convert-lead), finance (invoices/invoice-form, ledger/ledger-post).
export { ClientSearchService } from './data/client-search.service';

// Future: crm (stores/client-hub.store).
export type { ClientResponse } from './model/client.model';

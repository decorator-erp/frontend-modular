// The sites barrel (NEW-FEATURE-1, spec sites.md §6): exports ONLY the lazy routes. Routed pages are
// not exported — app.routes.ts would pull them into the initial bundle.

// app.routes.ts (the office shell's `{ path: '', loadChildren }` entry).
export { sitesRoutes } from './sites.routes';

// crm (crmp P2-B: the Client portal picker lists the project's surveys and their photo links).
export { SiteService } from './data/site.service';
export { SiteDocumentKind } from './model/site-enums';

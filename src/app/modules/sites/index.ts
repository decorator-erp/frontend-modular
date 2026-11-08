// The sites barrel (NEW-FEATURE-1, spec sites.md §6): exports ONLY the lazy routes. Routed pages are
// not exported — app.routes.ts would pull them into the initial bundle.

// app.routes.ts (the office shell's `{ path: '', loadChildren }` entry).
export { sitesRoutes } from './sites.routes';

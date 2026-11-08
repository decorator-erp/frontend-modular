import type { Type } from '@angular/core';

/**
 * crmp P2-B: the lazy loader of the "Share with client" action, for item screens in other modules
 * (sites today). A loader, not the class: the barrel is imported statically by app.routes.ts, and a
 * component exported from it would land in the initial bundle. The host renders the loaded class
 * with `*ngComponentOutlet` and four inputs: `projectId`, `kind` (`PORTAL_SHARE_KIND`), `itemId`
 * and `itemName`.
 */
export const crmPortalShareAction = (): Promise<Type<unknown>> =>
  import('../ui/portal/portal-share-action.component').then((m) => m.CrmPortalShareActionComponent);

/** The `kind` input's values (dms `PortalShareKind`, Crm.Contracts/Enums.cs:304-311). */
export { PortalShareKind as PORTAL_SHARE_KIND } from '../model/portal.model';

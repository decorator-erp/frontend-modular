import { Injectable, Injector, inject, signal } from '@angular/core';
import { PermissionsService } from '@platform/permissions';
import { loadMyAccessGrantsStore } from '@modules/projects';
import type { NavItem } from './nav-config';

/**
 * Whether the caller may open a nav item. Shared by the sidebar and (RD-1) the phone tab bar,
 * so both menus always agree.
 *
 * crmp P1-B: "Shared with me" shows only when the caller has project access grants, and an item
 * with a `grantArea` also shows to a caller whose whole-project grant opens that area.
 */
@Injectable({ providedIn: 'root' })
export class NavAccessService {
  private readonly permissions = inject(PermissionsService);
  private readonly injector = inject(Injector);
  /** The caller's grants, once the lazy store has loaded (null until then). */
  private readonly myGrants = signal<{
    hasAny(): boolean;
    opensArea(area: 'Sites'): boolean;
  } | null>(null);

  constructor() {
    void loadMyAccessGrantsStore().then((Store) => {
      const store = this.injector.get(Store);
      store.ensure();
      this.myGrants.set(store);
    });
  }

  canAccess(item: NavItem): boolean {
    const grants = this.myGrants();
    if (item.when === 'accessGrants' && !grants?.hasAny()) return false;
    if (!item.capability || this.permissions.can(item.capability)) return true;
    return !!item.grantArea && !!grants?.opensArea(item.grantArea);
  }
}

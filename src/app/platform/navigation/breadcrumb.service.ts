import { Injectable, signal } from '@angular/core';

/** One breadcrumb segment. `route` is an optional absolute path the label links to. */
export interface BreadcrumbCrumb {
  label: string;
  route?: string;
}

/**
 * App-shell breadcrumb trail. A page component pushes a rich trail
 * (e.g. DMS / Project / Stage / Task) in `ngOnInit` and clears it in
 * `ngOnDestroy`; the topbar renders the trail when set, otherwise falls back to
 * the route's static `breadcrumb` data. Kept in `core` (no `@ds` dependency) so
 * both the layout and feature pages can use it.
 */
@Injectable({ providedIn: 'root' })
export class BreadcrumbService {
  readonly trail = signal<BreadcrumbCrumb[] | null>(null);

  set(crumbs: BreadcrumbCrumb[]): void {
    this.trail.set(crumbs);
  }

  clear(): void {
    this.trail.set(null);
  }
}

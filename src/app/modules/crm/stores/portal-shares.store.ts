import { HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { PERM, PermissionsService } from '@platform/permissions';
import { CrmPortalVisibilityService } from '../data/crm-portal-visibility.service';
import type { PortalShare, PortalShareKind } from '../model/portal.model';

export type SharesLoadState = 'idle' | 'loading' | 'ready' | 'error' | 'notFound' | 'forbidden';

interface ProjectShares {
  state: SharesLoadState;
  shares: PortalShare[];
  /** `Date.now()` of the last completed read. */
  loadedAt: number;
}

/** A read older than this is repeated by `ensure` (another office user may have shared since). */
const STALE_MS = 30_000;

/**
 * crmp P2-B: the active portal shares of a project, read once per page (`GET …/portal/shares`) and
 * shared by everything on it — the office Client portal tab, its picker ("already shared") and the
 * "Share with client" action's badge on the document, photo, stage and task screens. Root-provided
 * and keyed by project; a page calls `ensure(projectId, true)` once to re-read, and every share write
 * calls `refresh`. Reading needs `crm.portal.manage` or `clients.read`; without either nothing loads.
 */
@Injectable({ providedIn: 'root' })
export class PortalSharesStore {
  private readonly api = inject(CrmPortalVisibilityService);
  private readonly permissions = inject(PermissionsService);
  private readonly byProject = signal<ReadonlyMap<string, ProjectShares>>(new Map());
  private readonly generations = new Map<string, number>();

  canRead(): boolean {
    return this.permissions.can([PERM.crm.portalVisibility.manage, PERM.clients.read]);
  }

  state(projectId: string): SharesLoadState {
    return this.byProject().get(projectId)?.state ?? 'idle';
  }

  shares(projectId: string): PortalShare[] {
    return this.byProject().get(projectId)?.shares ?? [];
  }

  /** The active share of one item, if any. */
  find(projectId: string, kind: PortalShareKind, itemId: string): PortalShare | null {
    return this.shares(projectId).find((s) => s.itemKind === kind && s.itemId === itemId) ?? null;
  }

  /**
   * Load the project's shares unless a fresh read is held (or one is in flight); `force` re-reads.
   * Rows of one page all call it, so the page reads the list once.
   */
  ensure(projectId: string, force = false): void {
    if (!projectId || !this.canRead()) return;
    const entry = this.byProject().get(projectId);
    const state = entry?.state ?? 'idle';
    if (!force && state === 'loading') return;
    if (!force && state === 'ready' && Date.now() - (entry?.loadedAt ?? 0) < STALE_MS) return;
    if (!force && (state === 'notFound' || state === 'forbidden')) return;
    this.refresh(projectId);
  }

  refresh(projectId: string): void {
    if (!projectId || !this.canRead()) return;
    const gen = (this.generations.get(projectId) ?? 0) + 1;
    this.generations.set(projectId, gen);
    this.patch(projectId, { state: 'loading' });
    this.api.getShares(projectId).subscribe({
      next: (shares) => {
        if (this.generations.get(projectId) !== gen) return;
        this.patch(projectId, { state: 'ready', shares, loadedAt: Date.now() });
      },
      error: (err: unknown) => {
        if (this.generations.get(projectId) !== gen) return;
        const status = err instanceof HttpErrorResponse ? err.status : 0;
        this.patch(projectId, {
          state: status === 404 ? 'notFound' : status === 403 ? 'forbidden' : 'error',
        });
      },
    });
  }

  /** Optimistic local order (the server order is written separately). */
  setOrder(projectId: string, shares: PortalShare[]): void {
    this.patch(projectId, { shares });
  }

  private patch(projectId: string, change: Partial<ProjectShares>): void {
    this.byProject.update((m) => {
      const prev = m.get(projectId) ?? {
        state: 'idle' as SharesLoadState,
        shares: [],
        loadedAt: 0,
      };
      return new Map(m).set(projectId, { ...prev, ...change });
    });
  }
}

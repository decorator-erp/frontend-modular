import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { AuthStore } from '@platform/auth/auth.store';
import { ProjectAccessGrantService } from '../data/project-access-grant.service';
import type { MyAccessGrant } from '../model/access-grant.model';

/**
 * crmp P1-B: the caller's own Active and Upcoming grants ("Shared with me", `GET /api/me/access-grants`).
 * Read once per signed-in user (the nav entry shows only when there are rows); `refresh()` re-reads.
 * A logout or another login drops the rows. A failed read leaves the list empty and is retried on the
 * next `ensure()`.
 */
@Injectable({ providedIn: 'root' })
export class MyAccessGrantsStore {
  private readonly api = inject(ProjectAccessGrantService);
  private readonly auth = inject(AuthStore);

  readonly grants = signal<MyAccessGrant[]>([]);
  readonly loading = signal(false);
  readonly error = signal(false);
  readonly hasAny = computed(() => this.grants().length > 0);

  private loadedFor: string | null = null;

  constructor() {
    // A logout or another login drops the previous user's rows.
    effect(() => {
      const uid = this.uid();
      untracked(() => {
        if (this.loadedFor !== null && this.loadedFor !== uid) {
          this.loadedFor = null;
          this.grants.set([]);
          this.error.set(false);
        }
      });
    });
  }

  private uid(): string | null {
    return this.auth.user()?.userId ?? null;
  }

  /** Read the grants once for the signed-in user. */
  ensure(): void {
    const uid = untracked(() => this.uid());
    if (!uid || this.loadedFor === uid || untracked(() => this.loading())) return;
    this.refresh();
  }

  refresh(): void {
    const uid = untracked(() => this.uid());
    if (!uid) return;
    this.loading.set(true);
    this.error.set(false);
    this.api.mine().subscribe({
      next: (rows) => {
        if (untracked(() => this.uid()) !== uid) return;
        this.grants.set(rows);
        this.loadedFor = uid;
        this.loading.set(false);
      },
      error: () => {
        if (untracked(() => this.uid()) !== uid) return;
        this.error.set(true);
        this.loading.set(false);
      },
    });
  }
}

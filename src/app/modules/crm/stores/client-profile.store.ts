import { computed, inject } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { patchState, signalStore, withComputed, withMethods, withState } from '@ngrx/signals';
import { CrmClientPortalService } from '../data/crm-portal.service';
import type { CatalogKey } from '@platform/i18n/catalog/en';
import type { ClientIdentity, ClientProfileContact, ClientProfileProject } from '../model';

interface ClientProfileState {
  client: ClientIdentity | null;
  contacts: ClientProfileContact[];
  projects: ClientProfileProject[];
  loading: boolean;
  loaded: boolean;
  /**
   * A catalog KEY, not prose — the one deliberate deviation from this repo's usual
   * `error: string | null` idiom. This store is client-only (never consumed by an
   * office screen), and FR-037a is a hard, un-deferrable gate here, so every
   * consumer renders `catalog.t(error()!)` rather than the raw text other stores hold.
   */
  error: CatalogKey | null;
}

function profileErrorKey(err: unknown): CatalogKey {
  const status = err instanceof HttpErrorResponse ? err.status : 0;
  if (status === 404) return 'client.profileNoClient';
  if (status === 403) return 'client.profileNotClient';
  return 'client.profileUnavailable';
}

const INITIAL: ClientProfileState = {
  client: null,
  contacts: [],
  projects: [],
  loading: false,
  loaded: false,
  error: null,
};

/**
 * The signed-in client's own profile — feature-scoped, provided once by the client
 * shell so every nav destination (profile, scheduler, add-requirement) shares one
 * load. Backed by `CrmClientPortalService.getMyProfile()` (`GET /api/crm/portal/profile`).
 * crmp C-2: a failed `load()` sets `error()` to a catalog key — 404 (no linked client
 * row) → `client.profileNoClient`, 403 (not a client login) → `client.profileNotClient`,
 * anything else → `client.profileUnavailable` (retryable) — never a raw status.
 * **`rxMethod` is used nowhere in this repo and is not introduced here.**
 */
export const ClientProfileStore = signalStore(
  withState<ClientProfileState>(INITIAL),

  withComputed((store) => ({
    /** One project renders flat, several render as cards (FR-028). */
    isSingleProject: computed(() => store.projects().length === 1),
    primaryContact: computed(() => store.contacts().find((c) => c.isPrimary) ?? null),
  })),

  withMethods((store, api = inject(CrmClientPortalService)) => ({
    load(): void {
      if (store.loading()) return;
      patchState(store, { loading: true, error: null });
      api.getMyProfile().subscribe({
        next: (profile) =>
          patchState(store, {
            client: profile.client,
            contacts: profile.contacts,
            projects: profile.projects,
            loading: false,
            loaded: true,
          }),
        error: (err: unknown) =>
          patchState(store, {
            loading: false,
            loaded: true,
            error: profileErrorKey(err),
          }),
      });
    },
  })),
);

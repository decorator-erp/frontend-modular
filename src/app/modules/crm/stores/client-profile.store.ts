import { computed, inject } from '@angular/core';
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
 * load. Backed by `CrmClientPortalService.getMyProfile()`, which targets **Dependency
 * 13** (not yet shipped — see that service's docblock and CLAUDE.md). Until the route
 * ships, `load()` fails and `error()` carries a friendly message rather than a raw
 * `404`/`403` — every consumer renders that alert instead of a broken form.
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
        error: () =>
          patchState(store, {
            loading: false,
            loaded: true,
            error: 'client.profileUnavailable',
          }),
      });
    },
  })),
);

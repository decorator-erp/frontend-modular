import { computed, inject } from '@angular/core';
import { patchState, signalStore, withComputed, withMethods, withState } from '@ngrx/signals';
import { ClientService } from '@modules/clients';
import { ProjectService } from '@modules/projects';
import { CrmContact, CrmContactService } from '../data/crm-contact.service';
import { CrmNote, CrmNoteService } from '../data/crm-note.service';
import type { CatalogKey } from '@platform/i18n/catalog/en';
import type { ClientResponse } from '@modules/clients';
import type { Project } from '@modules/projects';

interface ClientHubState {
  clientId: string;
  client: ClientResponse | null;
  contacts: CrmContact[];
  projects: Project[];
  notes: CrmNote[];
  selectedProjectId: string | null;
  loading: boolean;
  loaded: boolean;
  error: CatalogKey | null;
}

const INITIAL: ClientHubState = {
  clientId: '',
  client: null,
  contacts: [],
  projects: [],
  notes: [],
  selectedProjectId: null,
  loading: false,
  loaded: false,
  error: null,
};

/**
 * The office-side Client Hub — one client's identity, contacts, projects and internal
 * notes in a single load, feature-scoped to `ClientHubComponent`. The `selectedProjectId`
 * it carries is the project-context anchor every Gathering/Meetings/Approvals tab binds
 * to; it defaults to the client's only project when there is exactly one, and to `null`
 * (no project selected — the empty state prompts a pick or a quick-create) otherwise.
 *
 * Mirrors `ClientProfileStore`'s `error: CatalogKey` idiom — this hub is office-only
 * (not FR-037a critical), but a bare fetch failure still deserves a translated banner
 * rather than raw English, and the failure mode (an unknown/inaccessible client id) is
 * exactly as user-facing as the portal's own missing-profile case.
 */
export const ClientHubStore = signalStore(
  withState<ClientHubState>(INITIAL),

  withComputed((store) => ({
    primaryContact: computed(() => store.contacts().find((c) => c.isPrimary) ?? null),
    selectedProject: computed(
      () => store.projects().find((p) => p.id === store.selectedProjectId()) ?? null,
    ),
  })),

  withMethods(
    (
      store,
      clientApi = inject(ClientService),
      projectApi = inject(ProjectService),
      contactApi = inject(CrmContactService),
      noteApi = inject(CrmNoteService),
    ) => ({
      load(clientId: string): void {
        if (store.loading()) return;
        patchState(store, { clientId, loading: true, error: null });
        clientApi.getById(clientId).subscribe({
          next: (client) => {
            patchState(store, { client, loading: false, loaded: true });
          },
          error: () => patchState(store, { loading: false, loaded: true, error: 'hub.loadError' }),
        });
        projectApi.getByClient(clientId).subscribe({
          next: (projects) =>
            patchState(store, (s) => ({
              projects,
              selectedProjectId:
                s.selectedProjectId ?? (projects.length === 1 ? projects[0].id : null),
            })),
          error: () => undefined,
        });
        contactApi.getForClient(clientId).subscribe({
          next: (contacts) => patchState(store, { contacts }),
          error: () => undefined,
        });
        noteApi.getForClient(clientId).subscribe({
          next: (notes) => patchState(store, { notes }),
          error: () => undefined,
        });
      },

      selectProject(projectId: string | null): void {
        patchState(store, { selectedProjectId: projectId });
      },

      reloadContacts(): void {
        if (!store.clientId()) return;
        contactApi
          .getForClient(store.clientId())
          .subscribe((contacts) => patchState(store, { contacts }));
      },

      reloadNotes(): void {
        if (!store.clientId()) return;
        noteApi.getForClient(store.clientId()).subscribe((notes) => patchState(store, { notes }));
      },

      reloadProjects(selectNewestAsCurrent = false): void {
        if (!store.clientId()) return;
        projectApi.getByClient(store.clientId()).subscribe((projects) =>
          patchState(store, (s) => ({
            projects,
            selectedProjectId: selectNewestAsCurrent
              ? (projects[projects.length - 1]?.id ?? s.selectedProjectId)
              : s.selectedProjectId,
          })),
        );
      },
    }),
  ),
);

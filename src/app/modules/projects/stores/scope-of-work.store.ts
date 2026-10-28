import { HttpErrorResponse } from '@angular/common/http';
import { computed, inject } from '@angular/core';
import { patchState, signalStore, withComputed, withMethods, withState } from '@ngrx/signals';
import { forkJoin, Observable } from 'rxjs';
import { StageTemplatesService, TemplateStage } from '@modules/library';
import { EmployeeService } from '@modules/people';
import { injectReloadOnConflict } from '@platform/http/concurrency';
import {
  ErrorHandlerService,
  friendly,
  hasCatalogMessage,
} from '@platform/http/error-handler.service';
import { CatalogService } from '@platform/i18n/catalog.service';
import { ProjectService } from '../data/project.service';
import { ScopeOfWorkService } from '../data/scope-of-work.service';
import { Project } from '../model/project.model';
import {
  ScopeOfWork,
  ScopeOfWorkStatus,
  SowTemplateOption,
  UpdateScopeOfWorkHeaderRequest,
  UpdateScopeOfWorkItemRequest,
} from '../model/scope-of-work.model';

/** B9: the quiet header save status. */
export type SowHeaderStatus = 'idle' | 'saving' | 'saved';

interface ScopeOfWorkState {
  projectId: string | null;
  scope: ScopeOfWork | null;
  project: Project | null;
  loading: boolean;
  /** 404 `projects.NotFound`: missing, inactive or out of scope (B14). */
  notFound: boolean;
  /** A write is in flight. */
  saving: boolean;
  /** The last failed action's message, already localized (B14), or null. */
  error: string | null;
  /**
   * B14: confirm's own failure (403 `projects.AccessDenied`, 409 `teams.MissingHead`, …),
   * shown at the button.
   */
  confirmError: string | null;
  /** B6 picker: `GET /api/stage-templates`, read when the picker first opens. */
  templates: SowTemplateOption[];
  selectedTemplateId: string | null;
  /** The selected template's stages (`GET /api/stage-templates/{id}/stages`). */
  templateStages: TemplateStage[];
  templatesLoading: boolean;
  /** B9: the last header save: in flight, done, or nothing to say. */
  headerStatus: SowHeaderStatus;
  /** B11: the confirmer's name, resolved through HR from `confirmedById` ("—" on failure). */
  confirmedByName: string | null;
  /**
   * FINDING-7-1: the header as last sent, until a reload after its write lands (null: the
   * stored header is current). The next header edit builds on it, never on a stale read.
   */
  headerDraft: UpdateScopeOfWorkHeaderRequest | null;
  /** FINDING-7-2: the same, per item id: the item body as last sent, until a reload lands. */
  itemDrafts: Record<string, UpdateScopeOfWorkItemRequest>;
}

const INITIAL: ScopeOfWorkState = {
  projectId: null,
  scope: null,
  project: null,
  loading: false,
  notFound: false,
  saving: false,
  error: null,
  confirmError: null,
  templates: [],
  selectedTemplateId: null,
  templateStages: [],
  templatesLoading: false,
  headerStatus: 'idle',
  confirmedByName: null,
  headerDraft: null,
  itemDrafts: {},
};

/**
 * The scope-of-work page state (NEW-FEATURE-1, specs/sow-scope-of-work.md §1). Feature-scoped:
 * provide it in the page's `providers`. Every write reloads the scope from the server on
 * success (subtotal, total, order and `blockingReason` are the server's), and a 409
 * `projects.scope.ConcurrentUpdate` reloads through `injectReloadOnConflict()` (009b X-3).
 * Store methods stay `void` + `.subscribe` (the repo idiom; no `rxMethod`).
 */
export const ScopeOfWorkStore = signalStore(
  withState<ScopeOfWorkState>(INITIAL),

  withComputed((store) => ({
    /** The items in server order. */
    items: computed(() => store.scope()?.items ?? []),
    isConfirmed: computed(() => store.scope()?.status === ScopeOfWorkStatus.Confirmed),
    /** `sourceStageId` of every item: the picker's "Added · remove" state (B6). */
    pickedStageIds: computed(() => (store.scope()?.items ?? []).map((i) => i.sourceStageId)),
  })),

  withMethods(
    (
      store,
      api = inject(ScopeOfWorkService),
      projects = inject(ProjectService),
      stageTemplates = inject(StageTemplatesService),
      employees = inject(EmployeeService),
      errors = inject(ErrorHandlerService),
      catalog = inject(CatalogService),
      reloadOnConflict = injectReloadOnConflict(),
    ) => {
      /** B11: resolves the confirmer's name once per `confirmedById`; "—" when HR can't say. */
      let confirmerId: string | null = null;
      const resolveConfirmer = (scope: ScopeOfWork): void => {
        const id = scope.confirmedById;
        if (!id || id === confirmerId) return;
        confirmerId = id;
        employees.getById(id).subscribe({
          next: (e) => patchState(store, { confirmedByName: e.fullName || '—' }),
          error: () => patchState(store, { confirmedByName: '—' }),
        });
      };

      /** Re-read the scope only (the project does not change under these writes). */
      const refresh = (): void => {
        const projectId = store.projectId();
        if (!projectId) return;
        api.getScope(projectId).subscribe({
          next: (scope) => {
            patchState(store, {
              scope,
              headerDraft: lanes.has('header') ? store.headerDraft() : null,
              itemDrafts: Object.fromEntries(
                Object.entries(store.itemDrafts()).filter(([id]) => lanes.has(`item:${id}`)),
              ),
            });
            resolveConfirmer(scope);
          },
          error: (err: unknown) =>
            err instanceof HttpErrorResponse && err.status === 404
              ? patchState(store, { scope: null, notFound: true })
              : patchState(store, { error: catalog.t('sow.loadFailed') }),
        });
      };

      /**
       * A failed write: a concurrency 409 reloads and says so, anything else shows its message
       * (and reloads on a 409 or 404). The failed body's draft is dropped by the caller, so its
       * input shows the stored value again.
       */
      const fail = (err: unknown, errorField: 'error' | 'confirmError' = 'error'): void => {
        if (reloadOnConflict(err, refresh)) return;
        patchState(store, {
          [errorField]: codedMessage(err, errors) ?? catalog.t('sow.saveFailed'),
        });
        // FINDING-7-4: a 409 or 404 says the stored scope moved on: re-read it.
        if (err instanceof HttpErrorResponse && (err.status === 409 || err.status === 404)) {
          refresh();
        }
      };

      /**
       * FINDING-7-1: one write in flight per `key`. A body sent meanwhile waits, replacing any
       * older waiting one (each body already carries every earlier edit), so the last edit
       * lands last; the reload runs once the key drains. A failure drops what waits.
       */
      const lanes = new Map<string, ((projectId: string) => Observable<unknown>) | null>();
      const serial = (
        key: string,
        call: (projectId: string) => Observable<unknown>,
        settled: (ok: boolean) => void,
      ): void => {
        if (lanes.has(key)) {
          lanes.set(key, call);
          return;
        }
        const projectId = store.projectId();
        if (!projectId) return;
        lanes.set(key, null);
        patchState(store, { saving: true, error: null, confirmError: null });
        call(projectId).subscribe({
          next: () => {
            const queued = lanes.get(key);
            lanes.delete(key);
            if (queued) return serial(key, queued, settled);
            patchState(store, { saving: false });
            settled(true);
            refresh();
          },
          error: (err: unknown) => {
            lanes.delete(key);
            patchState(store, { saving: false });
            settled(false);
            fail(err);
          },
        });
      };

      /** Runs one write: reload on success, reload on a concurrency 409, else show the message. */
      const write = (
        call: (projectId: string) => Observable<unknown>,
        settled?: (ok: boolean) => void,
        errorField: 'error' | 'confirmError' = 'error',
      ): void => {
        const projectId = store.projectId();
        if (!projectId) return;
        patchState(store, { saving: true, error: null, confirmError: null });
        call(projectId).subscribe({
          next: () => {
            patchState(store, { saving: false });
            settled?.(true);
            refresh();
          },
          error: (err: unknown) => {
            patchState(store, { saving: false });
            settled?.(false);
            fail(err, errorField);
          },
        });
      };

      return {
        /** B1: the scope and the project. `id: null` is an empty Draft, not an error. */
        load(projectId: string): void {
          confirmerId = null;
          patchState(store, { ...INITIAL, projectId, loading: true });
          forkJoin({
            scope: api.getScope(projectId),
            project: projects.getById(projectId),
          }).subscribe({
            next: ({ scope, project }) => {
              patchState(store, { scope, project, loading: false });
              resolveConfirmer(scope);
            },
            error: (err: unknown) =>
              err instanceof HttpErrorResponse && err.status === 404
                ? patchState(store, { loading: false, notFound: true })
                : patchState(store, { loading: false, error: catalog.t('sow.loadFailed') }),
          });
        },

        reload: refresh,

        /** Clears the inline action error. */
        clearError(): void {
          patchState(store, { error: null });
        },

        /**
         * B9 `PUT …/scope-of-work`: one call carrying all five header fields (a full replace),
         * with the quiet "Saving…" / "Saved" status. FINDING-7-1: header writes are serialized
         * and `headerDraft` holds the body until the reload lands.
         */
        updateHeader(req: UpdateScopeOfWorkHeaderRequest): void {
          patchState(store, { headerStatus: 'saving', headerDraft: req });
          serial(
            'header',
            (projectId) => api.updateHeader(projectId, req),
            (ok) =>
              patchState(
                store,
                ok ? { headerStatus: 'saved' } : { headerStatus: 'idle', headerDraft: null },
              ),
          );
        },

        /**
         * B3 `PUT …/items/{itemId}`: the caller re-sends the stored `description`.
         * FINDING-7-2: one item's writes are serialized and `itemDrafts` holds its last body.
         */
        updateItem(itemId: string, req: UpdateScopeOfWorkItemRequest): void {
          patchState(store, { itemDrafts: { ...store.itemDrafts(), [itemId]: req } });
          serial(
            `item:${itemId}`,
            (projectId) => api.updateItem(projectId, itemId, req),
            (ok) => {
              if (ok) return;
              const { [itemId]: _dropped, ...rest } = store.itemDrafts();
              patchState(store, { itemDrafts: rest });
            },
          );
        },

        /** B4 `PUT …/items/order`: **every** item id, in the new order. */
        reorder(itemIds: string[]): void {
          write((projectId) => api.reorder(projectId, itemIds));
        },

        /** B5 `DELETE …/items/{itemId}`, then reload (the server renumbers). */
        removeItem(itemId: string): void {
          write((projectId) => api.removeItem(projectId, itemId));
        },

        /**
         * B10 `POST …/confirm`, then reload: the scope comes back Confirmed with each item's
         * `createdStageId`. B14: a failure (403 `projects.AccessDenied`, marked `handled(403)`
         * so no global toast; 409 `teams.MissingHead`; …) lands in `confirmError`, at the button.
         */
        confirm(): void {
          write((projectId) => api.confirm(projectId), undefined, 'confirmError');
        },

        /** B6: the template pills; opens the first template's stages. */
        loadTemplates(): void {
          patchState(store, { templatesLoading: true });
          stageTemplates.list().subscribe({
            next: (list) => {
              const templates = list.map((t) => ({ id: t.id, name: t.name }));
              patchState(store, { templates, templatesLoading: false });
              const first = templates[0]?.id ?? null;
              if (first && !store.selectedTemplateId()) this.selectTemplate(first);
            },
            error: () =>
              patchState(store, { templatesLoading: false, error: catalog.t('sow.loadFailed') }),
          });
        },

        /** B6: the selected template's stages, with default fee and task count. */
        selectTemplate(templateId: string): void {
          patchState(store, {
            selectedTemplateId: templateId,
            templateStages: [],
            templatesLoading: true,
          });
          stageTemplates.stages(templateId).subscribe({
            next: (templateStages) => {
              if (store.selectedTemplateId() !== templateId) return;
              patchState(store, { templateStages, templatesLoading: false });
            },
            error: () =>
              patchState(store, { templatesLoading: false, error: catalog.t('sow.loadFailed') }),
          });
        },

        /** B6 "Add": `POST …/items { sourceStageIds: [stageId] }`. */
        addStage(stageId: string): void {
          write((projectId) => api.addItems(projectId, [stageId]));
        },

        /** B6 "Added · remove": deletes the item whose `sourceStageId` matches (C §8.4.3). */
        removeStage(stageId: string): void {
          const item = store.scope()?.items.find((i) => i.sourceStageId === stageId);
          if (item) this.removeItem(item.id);
        },

        /** B6 "Add whole template": the server skips stages already picked; `[]` is a no-op. */
        addTemplate(templateId: string): void {
          write((projectId) => api.addFromTemplate(projectId, templateId));
        },
      };
    },
  ),
);

/** The catalog message (EN/AR) for a coded server error, else `null`. */
function codedMessage(err: unknown, errors: ErrorHandlerService): string | null {
  if (!(err instanceof HttpErrorResponse)) return null;
  const parsed = errors.parse(err);
  return hasCatalogMessage(parsed) ? friendly(parsed) : null;
}

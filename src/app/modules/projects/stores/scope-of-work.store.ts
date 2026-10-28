import { HttpErrorResponse } from '@angular/common/http';
import { computed, inject } from '@angular/core';
import { patchState, signalStore, withComputed, withMethods, withState } from '@ngrx/signals';
import { forkJoin, Observable } from 'rxjs';
import { StageTemplatesService, TemplateStage } from '@modules/library';
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
  /** B6 picker: `GET /api/stage-templates`, read when the picker first opens. */
  templates: SowTemplateOption[];
  selectedTemplateId: string | null;
  /** The selected template's stages (`GET /api/stage-templates/{id}/stages`). */
  templateStages: TemplateStage[];
  templatesLoading: boolean;
  /** B9: the last header save: in flight, done, or nothing to say. */
  headerStatus: SowHeaderStatus;
}

const INITIAL: ScopeOfWorkState = {
  projectId: null,
  scope: null,
  project: null,
  loading: false,
  notFound: false,
  saving: false,
  error: null,
  templates: [],
  selectedTemplateId: null,
  templateStages: [],
  templatesLoading: false,
  headerStatus: 'idle',
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
      errors = inject(ErrorHandlerService),
      catalog = inject(CatalogService),
      reloadOnConflict = injectReloadOnConflict(),
    ) => {
      /** Re-read the scope only (the project does not change under these writes). */
      const refresh = (): void => {
        const projectId = store.projectId();
        if (!projectId) return;
        api.getScope(projectId).subscribe({
          next: (scope) => patchState(store, { scope }),
          error: (err: unknown) =>
            err instanceof HttpErrorResponse && err.status === 404
              ? patchState(store, { scope: null, notFound: true })
              : patchState(store, { error: catalog.t('sow.loadFailed') }),
        });
      };

      /** Runs one write: reload on success, reload on a concurrency 409, else show the message. */
      const write = (
        call: (projectId: string) => Observable<unknown>,
        settled?: (ok: boolean) => void,
      ): void => {
        const projectId = store.projectId();
        if (!projectId) return;
        patchState(store, { saving: true, error: null });
        call(projectId).subscribe({
          next: () => {
            patchState(store, { saving: false });
            settled?.(true);
            refresh();
          },
          error: (err: unknown) => {
            patchState(store, { saving: false });
            settled?.(false);
            if (reloadOnConflict(err, refresh)) return;
            patchState(store, { error: codedMessage(err, errors) ?? catalog.t('sow.saveFailed') });
          },
        });
      };

      return {
        /** B1: the scope and the project. `id: null` is an empty Draft, not an error. */
        load(projectId: string): void {
          patchState(store, { ...INITIAL, projectId, loading: true });
          forkJoin({
            scope: api.getScope(projectId),
            project: projects.getById(projectId),
          }).subscribe({
            next: ({ scope, project }) => patchState(store, { scope, project, loading: false }),
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
         * with the quiet "Saving…" / "Saved" status.
         */
        updateHeader(req: UpdateScopeOfWorkHeaderRequest): void {
          patchState(store, { headerStatus: 'saving' });
          write(
            (projectId) => api.updateHeader(projectId, req),
            (ok) => patchState(store, { headerStatus: ok ? 'saved' : 'idle' }),
          );
        },

        /** B3 `PUT …/items/{itemId}`: the caller re-sends the stored `description`. */
        updateItem(itemId: string, req: UpdateScopeOfWorkItemRequest): void {
          write((projectId) => api.updateItem(projectId, itemId, req));
        },

        /** B4 `PUT …/items/order`: **every** item id, in the new order. */
        reorder(itemIds: string[]): void {
          write((projectId) => api.reorder(projectId, itemIds));
        },

        /** B5 `DELETE …/items/{itemId}`, then reload (the server renumbers). */
        removeItem(itemId: string): void {
          write((projectId) => api.removeItem(projectId, itemId));
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

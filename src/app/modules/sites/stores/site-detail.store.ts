import { HttpErrorResponse } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, catchError, firstValueFrom, of } from 'rxjs';
import { ProjectAccessStore } from '@modules/projects';
import { ToastService } from '@platform/feedback/toast.service';
import { injectReloadOnConflict } from '@platform/http/concurrency';
import { ErrorHandlerService, friendly } from '@platform/http/error-handler.service';
import { CatalogService } from '@platform/i18n/catalog.service';
import { PermissionsService } from '@platform/permissions/permissions.service';
import { SiteDefinitionService } from '../data/site-definition.service';
import { SiteLookupService } from '../data/site-lookup.service';
import { SiteService } from '../data/site.service';
import { siteCaps, type SiteCaps } from '../model/site-capabilities';
import { failureOutcome, type WriteOutcome } from '../model/site-errors';
import type { SiteModule } from '../model/site-definition.model';
import type { SiteDetail, SiteUnitData } from '../model/site.model';

/**
 * sites S-3 / S-4: one survey — the detail read, the active modules (for the records-per-module card
 * and the capture sub-tabs), employee names, and the workflow writes. Level and liveness come from
 * `ProjectAccessStore` (`myLevel`, `closed`, `me()`); every button is `caps()` (U3–U5).
 */
@Injectable()
export class SiteDetailStore {
  private readonly api = inject(SiteService);
  private readonly defs = inject(SiteDefinitionService);
  private readonly lookup = inject(SiteLookupService);
  private readonly access = inject(ProjectAccessStore);
  private readonly permissions = inject(PermissionsService);
  private readonly errors = inject(ErrorHandlerService);
  private readonly toast = inject(ToastService);
  private readonly catalog = inject(CatalogService);
  private readonly reloadOnConflict = injectReloadOnConflict();

  readonly siteId = signal<string | null>(null);
  readonly site = signal<SiteDetail | null>(null);
  readonly loading = signal(false);
  readonly notFound = signal(false);
  readonly error = signal<string | null>(null);
  readonly modules = signal<SiteModule[]>([]);
  readonly modulesLoaded = signal(false);
  readonly names = signal<Record<string, string | null>>({});
  /** Set after a 403 `sites.SelfApprovalNotAllowed`: the decision buttons stay off for the session. */
  readonly decisionBlocked = signal<string | null>(null);
  /** A workflow write is in flight (double-click guard). */
  readonly busy = signal(false);
  /** The last workflow refusal shown on the page (e.g. `AddressRequiredToSubmit`). */
  readonly actionError = signal<string | null>(null);
  readonly addressRequired = signal(false);

  readonly project = computed(() => {
    const s = this.site();
    return s ? this.access.project(s.projectId)() : null;
  });

  readonly caps = computed<SiteCaps>(() => {
    const caps = siteCaps(
      this.site(),
      this.project(),
      (p) => this.permissions.can(p),
      this.access.me(),
    );
    return this.decisionBlocked() ? { ...caps, decide: false, approve: false } : caps;
  });

  private generation = 0;

  load(siteId: string): void {
    if (this.siteId() !== siteId) {
      this.site.set(null);
      this.decisionBlocked.set(null);
      this.actionError.set(null);
      this.addressRequired.set(false);
    }
    this.siteId.set(siteId);
    this.reload();
    if (!this.modulesLoaded()) this.loadModules();
  }

  reload(): void {
    const id = this.siteId();
    if (!id) return;
    const gen = ++this.generation;
    this.loading.set(true);
    this.error.set(null);
    this.notFound.set(false);
    this.api.getById(id).subscribe({
      next: (site) => {
        if (gen !== this.generation) return;
        this.site.set(site);
        this.loading.set(false);
        this.access.ensure(site.projectId);
        this.resolveNames(site);
      },
      error: (err: unknown) => {
        if (gen !== this.generation) return;
        this.loading.set(false);
        if (err instanceof HttpErrorResponse && err.status === 404) {
          this.notFound.set(true);
          this.site.set(null);
          return;
        }
        this.error.set(
          err instanceof HttpErrorResponse
            ? friendly(this.errors.parse(err))
            : this.catalog.t('sv.detailFailed'),
        );
      },
    });
  }

  loadModules(): void {
    this.defs
      .modules()
      .pipe(catchError(() => of<SiteModule[]>([])))
      .subscribe((mods) => {
        this.modules.set(mods.filter((m) => m.isActive).sort((a, b) => a.sortOrder - b.sortOrder));
        this.modulesLoaded.set(true);
      });
  }

  name(id: string | null): string | null {
    return id ? (this.names()[id] ?? null) : null;
  }

  /**
   * S-5: the capture grid saved (record counts changed) or was refused. A level or closed-project
   * refusal re-reads the project (U3); the survey is re-read either way.
   */
  afterCapture(code: string | null): void {
    const projectId = this.site()?.projectId;
    if (projectId && (code === 'sites.InsufficientLevel' || code === 'sites.ProjectClosed')) {
      this.access.refresh(projectId);
    }
    this.reload();
  }

  // ── writes ──────────────────────────────────────────────────────────────────

  /** R4: the unit data, full replace. */
  updateUnit(data: SiteUnitData): Promise<WriteOutcome> {
    const s = this.site();
    if (!s) return Promise.resolve({ ok: false, message: null });
    return this.write(() => this.api.update(s.id, data), 'sv.saved');
  }

  /** R6: Draft → Submitted. */
  submit(): Promise<WriteOutcome> {
    const s = this.site();
    if (!s) return Promise.resolve({ ok: false, message: null });
    return this.write(() => this.api.submit(s.id), 'sv.submitted');
  }

  /** R7: approve or reject with an optional note (≤1000). */
  decide(approved: boolean, note: string | null): Promise<WriteOutcome> {
    const s = this.site();
    if (!s) return Promise.resolve({ ok: false, message: null });
    return this.write(
      () => this.api.decide(s.id, approved, note),
      approved ? 'sv.approvedToast' : 'sv.rejectedToast',
    );
  }

  /** R8: Rejected → Draft. */
  reopen(): Promise<WriteOutcome> {
    const s = this.site();
    if (!s) return Promise.resolve({ ok: false, message: null });
    return this.write(() => this.api.reopen(s.id), 'sv.reopened');
  }

  /** R5: soft delete (Draft/Rejected). The page navigates to `/sites` on ok. */
  remove(): Promise<WriteOutcome> {
    const s = this.site();
    if (!s) return Promise.resolve({ ok: false, message: null });
    return this.write(() => this.api.remove(s.id), null, { reload: false, code: s.code });
  }

  private async write(
    call: () => Observable<void>,
    successKey:
      'sv.saved' | 'sv.submitted' | 'sv.approvedToast' | 'sv.rejectedToast' | 'sv.reopened' | null,
    opts: { reload?: boolean; code?: string } = {},
  ): Promise<WriteOutcome> {
    if (this.busy()) return { ok: false, message: null };
    this.busy.set(true);
    this.actionError.set(null);
    this.addressRequired.set(false);
    try {
      await firstValueFrom(call());
      this.busy.set(false);
      this.toast.show({
        tone: 'success',
        message: successKey
          ? this.catalog.t(successKey)
          : this.catalog.t('sv.deleted', { c: opts.code ?? '' }),
      });
      if (opts.reload !== false) this.reload();
      return { ok: true };
    } catch (err) {
      this.busy.set(false);
      return this.fail(err);
    }
  }

  /** The S-4 error rules. Returns what the caller shows inline (null message = already handled). */
  private fail(err: unknown): WriteOutcome {
    if (this.reloadOnConflict(err, () => this.reload())) return { ok: false, reloaded: true };
    const outcome = failureOutcome(err, (e) => this.errors.parse(e));
    const projectId = this.site()?.projectId ?? '';
    switch (outcome.code) {
      // "The survey moved under you" (S-4): reload and say so.
      case 'sites.InvalidTransition':
      case 'sites.SiteLocked':
        this.reload();
        this.toast.show({ tone: 'warning', message: this.catalog.t('sv.conflictReloaded') });
        return { ...outcome, reloaded: true, message: null };
      case 'sites.ProjectClosed':
        this.access.refresh(projectId);
        this.reload();
        break;
      case 'sites.InsufficientLevel':
        this.access.refresh(projectId);
        break;
      case 'sites.SelfApprovalNotAllowed':
        this.decisionBlocked.set(outcome.message ?? this.catalog.t('sv.selfApprovalBlocked'));
        break;
      case 'sites.AddressRequiredToSubmit':
        this.addressRequired.set(true);
        break;
      case 'sites.NotFound':
        this.reload();
        break;
    }
    return outcome;
  }

  private resolveNames(site: SiteDetail): void {
    for (const id of [site.createdById, site.decidedById]) {
      if (!id || id in this.names()) continue;
      this.names.update((n) => ({ ...n, [id]: null }));
      this.lookup.employeeName(id).subscribe((name) => {
        this.names.update((n) => ({ ...n, [id]: name }));
      });
    }
  }
}

import { HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import {
  Observable,
  catchError,
  forkJoin,
  firstValueFrom,
  from,
  map,
  mergeMap,
  of,
  toArray,
} from 'rxjs';
import { ToastService } from '@platform/feedback/toast.service';
import { injectReloadOnConflict } from '@platform/http/concurrency';
import { ErrorHandlerService, friendly } from '@platform/http/error-handler.service';
import { CatalogService } from '@platform/i18n/catalog.service';
import type { CatalogKey } from '@platform/i18n/catalog/en';
import { SiteDefinitionService } from '../data/site-definition.service';
import { failureOutcome, problemErrors, type WriteOutcome } from '../model/site-errors';
import type {
  SiteItem,
  SiteItemUsage,
  SiteModule,
  SiteModuleSchema,
} from '../model/site-definition.model';

/**
 * sites S-10: the definitions admin state (spec §6 `stores/site-definitions.store.ts`). Modules (D1)
 * and items (D11) with or without inactive ones; each active module's field count from its schema
 * (D2, DEVIATION-S5); each item's usage (D15: modules + captured values). One module's schema for the
 * module page. Every write goes through `run()`: one in flight at a time, 409 ConcurrencyConflict
 * reloads, anything else comes back as an inline outcome with the catalog message.
 */
/** A6: per-row detail reads in flight at once. */
const DETAIL_CONCURRENCY = 4;

@Injectable()
export class SiteDefinitionsStore {
  private readonly api = inject(SiteDefinitionService);
  private readonly errors = inject(ErrorHandlerService);
  private readonly toast = inject(ToastService);
  private readonly catalog = inject(CatalogService);
  private readonly reloadOnConflict = injectReloadOnConflict();

  readonly includeInactive = signal(false);
  readonly modules = signal<SiteModule[] | null>(null);
  readonly items = signal<SiteItem[] | null>(null);
  readonly error = signal<string | null>(null);
  readonly fieldCounts = signal<Record<string, number | null>>({});
  readonly usage = signal<Record<string, SiteItemUsage | null>>({});
  readonly busy = signal(false);

  /** Module page: the module's schema; null while loading, `'inactive'` when D2 404s. */
  readonly schema = signal<SiteModuleSchema | null | 'inactive'>(null);

  private generation = 0;
  /** What a write's default `after` and a conflict reload: the lists page or the module page. */
  private reloadAll: (full: boolean) => void = (full) => this.load(full);

  setIncludeInactive(on: boolean): void {
    this.includeInactive.set(on);
    this.load();
  }

  /**
   * The lists page. Usage (D15) and field counts (D2) have no batch read on the backend
   * (SiteDefinitionEndpoints.cs:43,164), so they are read per row — at most `DETAIL_CONCURRENCY` at a
   * time — and kept: a later `load()` reads only rows it has not seen (A6). `full` drops them first
   * (Retry, a 409 conflict). Writes on this page change neither links nor captured values; an item's
   * active flag changes its modules' field counts, which `itemActiveChanged` re-reads. Captured
   * values change elsewhere (capture, other users), so a decision that hangs on them — Change shape,
   * the toggle's linked modules — reads that item's usage fresh first (BL-2). Reads of a superseded
   * load never land (BL-2).
   */
  load(full = false): void {
    this.reloadAll = (f) => this.load(f);
    if (full) {
      this.usage.set({});
      this.fieldCounts.set({});
    }
    const gen = ++this.generation;
    this.error.set(null);
    const inactive = this.includeInactive();
    forkJoin([this.api.modules(inactive), this.api.items(inactive)]).subscribe({
      next: ([modules, items]) => {
        if (gen !== this.generation) return;
        this.modules.set([...modules].sort((a, b) => a.sortOrder - b.sortOrder));
        this.items.set([...items].sort((a, b) => a.code.localeCompare(b.code)));
        this.loadFieldCounts(modules);
        this.loadUsage(items);
      },
      error: (err: unknown) => {
        if (gen !== this.generation) return;
        this.error.set(
          err instanceof HttpErrorResponse
            ? friendly(this.errors.parse(err))
            : this.catalog.t('sv.defsLoadFailed'),
        );
      },
    });
  }

  /** The module page: modules (inactive included, to find this one) + items + its schema. */
  loadModule(moduleId: string): void {
    this.reloadAll = () => this.loadModule(moduleId);
    this.includeInactive.set(true);
    const gen = ++this.generation;
    this.error.set(null);
    forkJoin([this.api.modules(true), this.api.items(false)]).subscribe({
      next: ([modules, items]) => {
        if (gen !== this.generation) return;
        this.modules.set(modules);
        this.items.set(items);
        const m = modules.find((x) => x.id === moduleId);
        if (!m) return;
        this.reloadSchema(m);
      },
      error: (err: unknown) => {
        if (gen !== this.generation) return;
        this.error.set(
          err instanceof HttpErrorResponse
            ? friendly(this.errors.parse(err))
            : this.catalog.t('sv.defsLoadFailed'),
        );
      },
    });
  }

  /** D2 is by code and 404s on an inactive module (DEVIATION-S5). */
  reloadSchema(m: SiteModule): void {
    if (!m.isActive) {
      this.schema.set('inactive');
      return;
    }
    this.api.schema(m.code).subscribe({
      next: (s) => this.schema.set(s),
      error: () => this.schema.set('inactive'),
    });
  }

  private loadFieldCounts(modules: SiteModule[]): void {
    const have = this.fieldCounts();
    const missing = modules.filter((m) => m.isActive && !(m.id in have));
    this.readEach(
      missing,
      (m) => this.api.schema(m.code).pipe(map((s) => s.fields.length)),
      (m) => m.id,
      this.fieldCounts,
    );
  }

  private loadUsage(items: SiteItem[]): void {
    const have = this.usage();
    const missing = items.filter((i) => !(i.id in have));
    this.readEach(
      missing,
      (i) => this.api.usage(i.id),
      (i) => i.id,
      this.usage,
    );
  }

  /**
   * A6: an item was (de)activated — its modules' field counts change (D2 lists active items). Its
   * links are read fresh (BL-2); when that read fails every count is dropped and re-read.
   */
  async itemActiveChanged(itemId: string): Promise<void> {
    const u = await this.freshUsage(itemId);
    const linked = u ? new Set(u.modules.map((m) => m.moduleId)) : null;
    this.fieldCounts.update((c) => {
      if (!linked) return {};
      const next = { ...c };
      for (const id of linked) delete next[id];
      return next;
    });
  }

  private readEach<R, V>(
    rows: R[],
    read: (row: R) => Observable<V>,
    key: (row: R) => string,
    into: { update(fn: (m: Record<string, V | null>) => Record<string, V | null>): void },
  ): void {
    if (!rows.length) return;
    const gen = this.generation;
    from(rows)
      .pipe(
        mergeMap(
          (r) =>
            read(r).pipe(
              catchError(() => of(null)),
              map((v) => [key(r), v] as const),
            ),
          DETAIL_CONCURRENCY,
        ),
        toArray(),
      )
      .subscribe((pairs) => {
        // BL-2: a later load (Retry, a 409 reload) cleared or re-reads these; drop the stale values
        if (gen !== this.generation) return;
        into.update((m) => ({ ...m, ...Object.fromEntries(pairs) }));
      });
  }

  /** One item's usage, fresh (the drawer). */
  refreshUsage(itemId: string): void {
    void this.freshUsage(itemId);
  }

  /** BL-2: one item's usage read now and cached; null when the read fails. */
  async freshUsage(itemId: string): Promise<SiteItemUsage | null> {
    const u = await firstValueFrom(this.api.usage(itemId).pipe(catchError(() => of(null))), {
      defaultValue: null,
    });
    this.usage.update((m) => ({ ...m, [itemId]: u }));
    return u;
  }

  /**
   * A definitions write. On success: optional toast, then `after` (default: reload the lists). A 409
   * ConcurrencyConflict reloads and toasts (`injectReloadOnConflict`); every other refusal is the
   * inline outcome (`sites.CodeTaken`, `SystemDefinitionNotRenameable`, `ItemLocked`, …).
   */
  async run<T>(
    call: () => Observable<T>,
    successKey: CatalogKey | null,
    after: (value: T) => void = () => this.reloadAll(false),
  ): Promise<WriteOutcome<T>> {
    if (this.busy()) return { ok: false, message: null };
    this.busy.set(true);
    try {
      const value = await firstValueFrom(call(), { defaultValue: undefined as T });
      if (successKey) this.toast.show({ tone: 'success', message: this.catalog.t(successKey) });
      after(value);
      return { ok: true, value };
    } catch (err) {
      // B7: the module page reloads itself (schema included), the lists page drops its caches.
      if (this.reloadOnConflict(err, () => this.reloadAll(true)))
        return { ok: false, reloaded: true };
      const outcome = failureOutcome(err, (e) => this.errors.parse(e));
      // `Request.NameEn` → `nameEn`: a FluentValidation path names the form field.
      const fieldErrors: Record<string, string> = {};
      for (const [path, messages] of Object.entries(problemErrors(err))) {
        const m = /^Request\.([A-Za-z]+)$/.exec(path);
        if (m && messages[0])
          fieldErrors[m[1].charAt(0).toLowerCase() + m[1].slice(1)] = messages[0];
      }
      return { ...outcome, fieldErrors };
    } finally {
      this.busy.set(false);
    }
  }
}

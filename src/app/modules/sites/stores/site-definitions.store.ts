import { HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { Observable, catchError, forkJoin, firstValueFrom, of } from 'rxjs';
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

  setIncludeInactive(on: boolean): void {
    this.includeInactive.set(on);
    this.load();
  }

  load(): void {
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
    const active = modules.filter((m) => m.isActive);
    if (!active.length) return this.fieldCounts.set({});
    forkJoin(active.map((m) => this.api.schema(m.code).pipe(catchError(() => of(null))))).subscribe(
      (schemas) => {
        const out: Record<string, number | null> = {};
        active.forEach((m, i) => (out[m.id] = schemas[i]?.fields.length ?? null));
        this.fieldCounts.set(out);
      },
    );
  }

  private loadUsage(items: SiteItem[]): void {
    if (!items.length) return this.usage.set({});
    forkJoin(items.map((i) => this.api.usage(i.id).pipe(catchError(() => of(null))))).subscribe(
      (list) => {
        const out: Record<string, SiteItemUsage | null> = {};
        items.forEach((i, k) => (out[i.id] = list[k]));
        this.usage.set(out);
      },
    );
  }

  /** One item's usage, fresh (the drawer). */
  refreshUsage(itemId: string): void {
    this.api
      .usage(itemId)
      .pipe(catchError(() => of(null)))
      .subscribe((u) => this.usage.update((m) => ({ ...m, [itemId]: u })));
  }

  /**
   * A definitions write. On success: optional toast, then `after` (default: reload the lists). A 409
   * ConcurrencyConflict reloads and toasts (`injectReloadOnConflict`); every other refusal is the
   * inline outcome (`sites.CodeTaken`, `SystemDefinitionNotRenameable`, `ItemLocked`, …).
   */
  async run<T>(
    call: () => Observable<T>,
    successKey: CatalogKey | null,
    after: (value: T) => void = () => this.load(),
  ): Promise<WriteOutcome<T>> {
    if (this.busy()) return { ok: false, message: null };
    this.busy.set(true);
    try {
      const value = await firstValueFrom(call(), { defaultValue: undefined as T });
      if (successKey) this.toast.show({ tone: 'success', message: this.catalog.t(successKey) });
      after(value);
      return { ok: true, value };
    } catch (err) {
      if (this.reloadOnConflict(err, () => this.load())) return { ok: false, reloaded: true };
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

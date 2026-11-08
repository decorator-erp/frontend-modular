import { HttpErrorResponse } from '@angular/common/http';
import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import { Observable, catchError, firstValueFrom, forkJoin, of } from 'rxjs';
import { ToastService } from '@platform/feedback/toast.service';
import { injectReloadOnConflict } from '@platform/http/concurrency';
import { ErrorHandlerService, friendly } from '@platform/http/error-handler.service';
import { CatalogService } from '@platform/i18n/catalog.service';
import { SiteDefinitionService } from '../data/site-definition.service';
import {
  SiteLookupService,
  type SiteCatalogEntry,
  type SiteSpaceOption,
} from '../data/site-lookup.service';
import { SiteService } from '../data/site.service';
import { SiteDetailStore } from './site-detail.store';
import { problemErrors } from '../model/site-errors';
import type { SiteModule, SiteSchemaField } from '../model/site-definition.model';
import {
  blankRow,
  bulkBody,
  draftFromPivot,
  duplicateRow,
  mapSaveErrors,
  precheck,
  tooManyRows,
  type CellErrors,
  type DraftRow,
} from '../model/site-grid';
import { localName } from '../model/site-normalize';
import { RECORD_NOTE_MAX, type CellValue } from '../model/site-validation';
import type { BulkSiteRecordRequest, SitePivot } from '../model/site.model';

/**
 * sites S-5: one module's capture grid on one survey. Columns are D2's VISIBLE fields in order; the
 * read data is R9 (+ R12 for each record's `catalogItemId`, which the pivot omits). A save is the
 * client pre-check, then `DELETE` of each removed stored row (R14, DEVIATION-S6), then ONE R11 bulk
 * save of every row. Hidden fields are never shown; their stored values are resent unchanged
 * (DEVIATION-17). Spaces and the catalog degrade on 403 (A1, BF-1).
 */
@Injectable()
export class SiteCaptureStore {
  private readonly api = inject(SiteService);
  private readonly defs = inject(SiteDefinitionService);
  private readonly lookup = inject(SiteLookupService);
  private readonly errors = inject(ErrorHandlerService);
  private readonly toast = inject(ToastService);
  private readonly catalog = inject(CatalogService);
  private readonly reloadOnConflict = injectReloadOnConflict();
  /** The survey page's store, told after a save (record counts) or a site-level refusal. */
  private readonly detail = inject(SiteDetailStore, { optional: true });

  readonly siteId = signal<string | null>(null);
  readonly projectId = signal<string | null>(null);
  readonly module = signal<SiteModule | null>(null);

  readonly fields = signal<SiteSchemaField[]>([]);
  readonly pivot = signal<SitePivot | null>(null);
  private readonly catalogByRecord = signal<Map<string, string | null>>(new Map());
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly moduleGone = signal(false);

  /** null = not loaded; `unavailable` = 403 (A1). */
  readonly spaces = signal<SiteSpaceOption[] | null>(null);
  readonly spacesUnavailable = signal(false);
  readonly categories = signal<SiteCatalogEntry[] | null>(null);
  readonly catalogItems = signal<SiteCatalogEntry[] | null>(null);
  readonly catalogUnavailable = signal(false);

  readonly draft = signal<DraftRow[] | null>(null);
  readonly removed = signal<string[]>([]);
  readonly cellErrors = signal<CellErrors>({});
  readonly banner = signal<string | null>(null);
  readonly saving = signal(false);
  /** The draft holds a change the server has not seen (A3: switching or leaving asks first). */
  readonly dirty = signal(false);
  /** Stored hidden values that cannot be resent (inactive option); this save clears them. */
  readonly unreadableHidden = signal(0);

  readonly visible = computed(() =>
    this.fields()
      .filter((f) => f.isVisible)
      .sort((a, b) => a.sortOrder - b.sortOrder),
  );
  readonly hidden = computed(() => this.fields().filter((f) => !f.isVisible));
  readonly rows = computed(() => this.pivot()?.rows ?? []);
  readonly catalogItemOf = (recordId: string) => this.catalogByRecord().get(recordId) ?? null;

  private generation = 0;
  private lastSent: BulkSiteRecordRequest[] = [];

  constructor() {
    inject(DestroyRef).onDestroy(() => this.detail?.captureDirty.set(false));
  }

  /** Select (or re-select) the grid. Discards a draft of another module. */
  open(siteId: string, projectId: string, module: SiteModule): void {
    const same = this.siteId() === siteId && this.module()?.id === module.id;
    this.siteId.set(siteId);
    this.module.set(module);
    if (this.projectId() !== projectId) {
      this.projectId.set(projectId);
      this.spaces.set(null);
      this.spacesUnavailable.set(false);
    }
    if (!same) this.cancel();
    this.load();
  }

  load(): void {
    const siteId = this.siteId();
    const module = this.module();
    if (!siteId || !module) return;
    const gen = ++this.generation;
    this.loading.set(true);
    this.error.set(null);
    this.moduleGone.set(false);
    forkJoin([
      this.defs.schema(module.code),
      this.api.pivot(siteId, module.id),
      this.api.grouped(siteId),
    ]).subscribe({
      next: ([schema, pivot, grouped]) => {
        if (gen !== this.generation) return;
        this.fields.set(schema.fields);
        this.pivot.set(pivot);
        const byRecord = new Map<string, string | null>();
        for (const g of grouped.groups)
          for (const r of g.records) byRecord.set(r.id, r.catalogItemId);
        this.catalogByRecord.set(byRecord);
        this.loading.set(false);
        if ([...byRecord.values()].some(Boolean)) this.ensureCatalog();
      },
      error: (err: unknown) => {
        if (gen !== this.generation) return;
        this.loading.set(false);
        if (err instanceof HttpErrorResponse && err.status === 404) {
          const code = this.errors.parse(err).code;
          if (code === 'sites.ModuleNotFound') {
            this.moduleGone.set(true);
            return;
          }
        }
        this.error.set(
          err instanceof HttpErrorResponse
            ? friendly(this.errors.parse(err))
            : this.catalog.t('sv.gridLoadFailed'),
        );
      },
    });
  }

  // ── editing ────────────────────────────────────────────────────────────────

  startEdit(): void {
    const module = this.module();
    if (!module || this.draft()) return;
    const built = draftFromPivot(
      this.rows(),
      this.visible(),
      this.hidden(),
      this.catalogByRecord(),
    );
    this.unreadableHidden.set(built.unreadable);
    const rows = built.rows.length ? built.rows : [blankRow(module.code, [], this.visible())];
    this.draft.set(rows);
    this.removed.set([]);
    this.cellErrors.set({});
    this.banner.set(null);
    this.setDirty(false);
    this.ensureSpaces();
    this.ensureCatalog();
  }

  cancel(): void {
    this.draft.set(null);
    this.removed.set([]);
    this.cellErrors.set({});
    this.banner.set(null);
    this.unreadableHidden.set(0);
    this.setDirty(false);
  }

  addRow(): void {
    const module = this.module();
    const rows = this.draft();
    if (!module || !rows) return;
    this.draft.set([...rows, blankRow(module.code, rows, this.visible())]);
    this.setDirty(true);
  }

  duplicate(key: string): void {
    const module = this.module();
    const rows = this.draft();
    if (!module || !rows) return;
    const i = rows.findIndex((r) => r.key === key);
    if (i < 0) return;
    const copy = duplicateRow(rows[i], module.code, rows);
    this.draft.set([...rows.slice(0, i + 1), copy, ...rows.slice(i + 1)]);
    this.setDirty(true);
  }

  remove(key: string): void {
    const rows = this.draft();
    if (!rows) return;
    const row = rows.find((r) => r.key === key);
    if (!row) return;
    if (row.recordId) this.removed.update((ids) => [...ids, row.recordId!]);
    this.draft.set(rows.filter((r) => r.key !== key));
    this.setDirty(true);
    this.clearError(`${key}:`);
  }

  setLabel(key: string, label: string): void {
    this.patch(key, { label });
    this.clearError(`${key}:label`);
  }

  setNote(key: string, note: string): void {
    this.patch(key, { note });
    this.clearError(`${key}:note`);
  }

  setSpace(key: string, spaceId: string | null): void {
    this.patch(key, { spaceId: spaceId || null });
    this.clearError(`${key}:space`);
  }

  setCatalogItem(key: string, catalogItemId: string | null): void {
    this.patch(key, { catalogItemId: catalogItemId || null });
    this.clearError(`${key}:catalog`);
  }

  setValue(key: string, itemId: string, value: CellValue): void {
    const rows = this.draft();
    if (!rows) return;
    this.draft.set(
      rows.map((r) => (r.key === key ? { ...r, values: { ...r.values, [itemId]: value } } : r)),
    );
    this.setDirty(true);
    this.clearError(`${key}:${itemId}`);
  }

  // ── save ───────────────────────────────────────────────────────────────────

  async save(): Promise<boolean> {
    const rows = this.draft();
    const module = this.module();
    const siteId = this.siteId();
    if (!rows || !module || !siteId || this.saving()) return false;
    this.banner.set(null);
    if (tooManyRows(rows)) {
      this.banner.set(this.t('sv.err.tooManyRows'));
      return false;
    }
    const pre = precheck(rows, this.visible(), (k, p) => this.t(k, p), RECORD_NOTE_MAX);
    this.cellErrors.set(pre);
    if (Object.keys(pre).length) {
      this.banner.set(this.t('sv.err.gridInvalid'));
      return false;
    }

    this.saving.set(true);
    const removed = this.removed();
    this.lastSent = [];
    try {
      // One DELETE at a time; each id leaves the queue as soon as it is gone, so a retry after a
      // partial failure re-sends only the rest. A 404 RecordNotFound means it is already deleted
      // (R14 → LoadEditableAsync, SiteRecordWrites.cs:19-40; soft-deleted rows are filtered out).
      for (const id of removed) {
        await this.deleteQueued(siteId, id);
        this.removed.update((ids) => ids.filter((x) => x !== id));
      }
      this.lastSent = bulkBody(rows, module.id, this.visible());
      await firstValueFrom(this.api.bulkSave(siteId, this.lastSent));
      this.saving.set(false);
      this.toast.show({
        tone: 'success',
        message: this.t('sv.gridSaved', { n: rows.length, r: removed.length }),
      });
      this.cancel();
      this.load();
      this.detail?.afterCapture(null);
      return true;
    } catch (err) {
      this.saving.set(false);
      this.onSaveError(err, rows);
      return false;
    }
  }

  private async deleteQueued(siteId: string, id: string): Promise<void> {
    try {
      await firstValueFrom(this.api.deleteRecord(siteId, id));
    } catch (err) {
      const gone =
        err instanceof HttpErrorResponse &&
        err.status === 404 &&
        this.errors.parse(err).code === 'sites.RecordNotFound';
      if (!gone) throw err;
    }
  }

  private onSaveError(err: unknown, rows: DraftRow[]): void {
    // The grid keeps the draft; the read data reloads (DEVIATION-S6).
    if (this.reloadOnConflict(err, () => this.load())) {
      this.detail?.afterCapture(null);
      return;
    }
    if (!(err instanceof HttpErrorResponse)) {
      this.banner.set(String(err));
      this.load();
      return;
    }
    const parsed = this.errors.parse(err);
    const raw = problemErrors(err);
    // A survey that moved (locked, closed project, level) also refreshes the page around the grid.
    this.detail?.afterCapture(parsed.code);
    const fallback = friendly(parsed);
    const siteId = this.siteId();
    const module = this.module();
    // Re-read the stored labels so a LabelTaken can point at the colliding rows.
    const reread: Observable<SitePivot | null> =
      siteId && module ? this.api.pivot(siteId, module.id) : of(null);
    reread.pipe(catchError(() => of(null))).subscribe((pivot: SitePivot | null) => {
      if (pivot) this.pivot.set(pivot);
      const inBatch = new Set(rows.map((r) => r.recordId).filter(Boolean));
      const otherLabels = (pivot?.rows ?? this.rows())
        .filter((r) => !inBatch.has(r.recordId))
        .map((r) => r.label);
      const locale = this.catalog.locale();
      const mapped = mapSaveErrors(raw, parsed.code, fallback, {
        rows,
        visible: this.visible(),
        hidden: this.hidden(),
        sent: this.lastSent,
        otherLabels,
        spaceIds: this.spaces() ? new Set(this.spaces()!.map((s) => s.id)) : null,
        catalogItemIds: this.catalogItems() ? new Set(this.catalogItems()!.map((c) => c.id)) : null,
        t: (k, p) => this.t(k, p),
        fieldName: (f) => localName(f, locale),
      });
      this.cellErrors.set(mapped.cells);
      this.banner.set(mapped.banner);
    });
  }

  // ── lookups (A1) ───────────────────────────────────────────────────────────

  private ensureSpaces(): void {
    const projectId = this.projectId();
    if (!projectId || this.spaces() || this.spacesUnavailable()) return;
    this.lookup.spaces(projectId).subscribe({
      next: (list) => this.spaces.set(list),
      error: () => this.spacesUnavailable.set(true),
    });
  }

  ensureCatalog(): void {
    if (this.catalogItems() || this.catalogUnavailable()) return;
    this.lookup.catalogCategories().subscribe({
      next: (cats) => this.categories.set(cats),
      error: () => this.catalogUnavailable.set(true),
    });
    this.lookup.allCatalogItems().subscribe({
      next: (items) => this.catalogItems.set(items),
      error: () => this.catalogUnavailable.set(true),
    });
  }

  // ── helpers ────────────────────────────────────────────────────────────────

  private patch(key: string, change: Partial<DraftRow>): void {
    const rows = this.draft();
    if (!rows) return;
    this.draft.set(rows.map((r) => (r.key === key ? { ...r, ...change } : r)));
    this.setDirty(true);
  }

  private setDirty(dirty: boolean): void {
    this.dirty.set(dirty);
    this.detail?.captureDirty.set(dirty);
  }

  private clearError(prefix: string): void {
    const errs = this.cellErrors();
    const keys = Object.keys(errs).filter((k) => k.startsWith(prefix));
    if (!keys.length) return;
    const next = { ...errs };
    for (const k of keys) delete next[k];
    this.cellErrors.set(next);
  }

  private t(
    key: Parameters<CatalogService['t']>[0],
    params?: Record<string, string | number>,
  ): string {
    return this.catalog.t(key, params);
  }
}

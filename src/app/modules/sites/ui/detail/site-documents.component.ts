import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import {
  ConfirmService,
  ModalService,
  PeraAlertComponent,
  PeraBadgeComponent,
  PeraButtonComponent,
  PeraCardComponent,
  PeraEmptyComponent,
  PeraIconComponent,
  PeraSkeletonComponent,
  type SelectOption,
} from '@ds';
import { ToastService } from '@platform/feedback/toast.service';
import { injectReloadOnConflict } from '@platform/http/concurrency';
import { ErrorHandlerService, friendly } from '@platform/http/error-handler.service';
import { CatalogService } from '@platform/i18n/catalog.service';
import type { CatalogKey } from '@platform/i18n/catalog/en';
import { formatCairoDate } from '@platform/i18n/intl-locale';
import { PermissionsService } from '@platform/permissions/permissions.service';
import { SiteLookupService, type SiteProjectDocument } from '../../data/site-lookup.service';
import { SiteService } from '../../data/site.service';
import { SITE_DOCUMENT_KIND_LABEL, SiteDocumentKind } from '../../model/site-enums';
import { failureOutcome, type WriteOutcome } from '../../model/site-errors';
import { SITE_PERM } from '../../model/site-permissions';
import type { SiteDocumentLink, SiteRecord } from '../../model/site.model';
import { SiteDetailStore } from '../../stores/site-detail.store';
import {
  SiteDocumentDialogComponent,
  type SiteDocumentDialogData,
  type SiteDocumentDialogRequest,
} from './site-document-dialog.component';

interface KindGroup {
  kind: SiteDocumentKind;
  links: SiteDocumentLink[];
}

/**
 * sites S-9: Documents (prototype `documentsTab`, `sites.js:693-759`). R18 links grouped by kind
 * (Sketch, Video, Photo — enum order) with counts; each card shows the file name (from the project's
 * documents, A1), kind chip, subject chip ("Whole survey" or `<moduleCode> · <label>` from R12), the
 * adder's name and date; Detach (R20). **Upload** (`documents.upload`) stores the file in the project
 * documents, then links it (R19); **Attach existing** (`documents.read`) links a project document.
 * Writes need `caps().edit` (Editor, Draft/Rejected, open project). A 403 on a documents read or
 * upload hides that action and says why (BF-1).
 */
@Component({
  selector: 'app-site-documents',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    PeraAlertComponent,
    PeraBadgeComponent,
    PeraButtonComponent,
    PeraCardComponent,
    PeraEmptyComponent,
    PeraIconComponent,
    PeraSkeletonComponent,
  ],
  template: `
    <pera-card padding="none">
      <div class="flex items-start justify-between gap-3 p-4 border-b border-border">
        <div>
          <h2 class="m-0 fs-body font-semibold">{{ t('sv.docsT') }}</h2>
          <p class="m-0 mt-1 fs-label text-text-secondary">{{ t('sv.docsSub') }}</p>
        </div>
        <div class="flex items-center gap-2 flex-wrap">
          @if (canUpload()) {
            <pera-button
              size="sm"
              iconStart="plus"
              [disabled]="busy()"
              (click)="open('upload')"
              data-upload
            >
              {{ t('sv.uploadDoc') }}
            </pera-button>
          }
          @if (canAttach()) {
            <pera-button
              size="sm"
              variant="primary"
              iconStart="file"
              [disabled]="busy()"
              (click)="open('link')"
              data-attach
            >
              {{ t('sv.linkDoc') }}
            </pera-button>
          }
        </div>
      </div>

      <div class="flex flex-col gap-2 px-4 pt-3 empty:hidden">
        @if (docsForbidden()) {
          <pera-alert tone="info" data-docs-read-unavailable>{{
            t('sv.docsReadUnavailable')
          }}</pera-alert>
        }
        @if (edit() && uploadBlocked()) {
          <pera-alert tone="info" data-docs-upload-unavailable>{{
            t('sv.docsUploadUnavailable')
          }}</pera-alert>
        }
        @if (actionError(); as message) {
          <pera-alert tone="danger" data-docs-action-error>{{ message }}</pera-alert>
        }
      </div>

      <div class="p-4">
        @if (error(); as message) {
          <pera-alert tone="danger" data-docs-error>
            {{ message }}
            <pera-button variant="secondary" size="sm" (click)="load()">{{
              t('sv.retry')
            }}</pera-button>
          </pera-alert>
        } @else if (links() === null) {
          <div class="grid gap-3 md:grid-cols-3" aria-busy="true">
            <pera-skeleton [height]="96" />
            <pera-skeleton [height]="96" />
            <pera-skeleton [height]="96" />
          </div>
        } @else if (links()!.length === 0) {
          <pera-empty
            [title]="t('sv.noDocs')"
            [description]="edit() ? t('sv.noDocsSub') : undefined"
            iconName="file"
            data-docs-empty
          />
        } @else {
          <div class="flex flex-col gap-4">
            @for (g of groups(); track g.kind) {
              <section [attr.data-kind-group]="g.kind">
                <h3 class="m-0 mb-2 fs-micro uppercase text-text-muted">
                  {{ kindLabel(g.kind) }} · {{ g.links.length }}
                </h3>
                <div class="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  @for (d of g.links; track d.id) {
                    <div
                      class="flex gap-3 p-3 border border-border bg-surface"
                      [attr.data-link]="d.id"
                    >
                      <div
                        class="flex items-center justify-center w-12 h-12 shrink-0 bg-surface-muted text-text-muted"
                      >
                        <pera-icon name="file" [size]="22" />
                      </div>
                      <div class="flex-1 min-w-0 flex flex-col gap-1">
                        <div class="flex items-start justify-between gap-2">
                          <span
                            class="font-semibold truncate"
                            dir="auto"
                            [attr.title]="fileName(d)"
                            data-file-name
                            >{{ fileName(d) }}</span
                          >
                          @if (edit()) {
                            <pera-button
                              size="xs"
                              variant="ghost"
                              iconStart="x"
                              [iconOnly]="true"
                              [disabled]="busy()"
                              [attr.aria-label]="t('sv.unlink')"
                              (click)="detach(d)"
                              data-detach
                            />
                          }
                        </div>
                        <div class="flex items-center gap-1 flex-wrap">
                          <pera-badge>{{ kindLabel(d.kind) }}</pera-badge>
                          <pera-badge
                            [tone]="d.recordId ? 'info' : 'neutral'"
                            dir="auto"
                            data-subject
                            >{{ subject(d) }}</pera-badge
                          >
                        </div>
                        <div class="fs-label text-text-muted">
                          {{ name(d.addedById) }} · {{ date(d.createdAtUtc) }}
                        </div>
                      </div>
                    </div>
                  }
                </div>
              </section>
            }
          </div>
        }
      </div>
    </pera-card>
  `,
})
export class SiteDocumentsComponent {
  private readonly api = inject(SiteService);
  private readonly lookup = inject(SiteLookupService);
  private readonly detail = inject(SiteDetailStore);
  private readonly catalog = inject(CatalogService);
  private readonly errors = inject(ErrorHandlerService);
  private readonly permissions = inject(PermissionsService);
  private readonly modal = inject(ModalService);
  private readonly confirm = inject(ConfirmService);
  private readonly toast = inject(ToastService);
  private readonly reloadOnConflict = injectReloadOnConflict();

  /** null while loading. */
  protected readonly links = signal<SiteDocumentLink[] | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly actionError = signal<string | null>(null);
  protected readonly busy = signal(false);
  /** The project's documents; null until read (or after a 403). */
  private readonly docs = signal<SiteProjectDocument[] | null>(null);
  protected readonly docsForbidden = signal(false);
  private readonly uploadForbidden = signal(false);
  private readonly records = signal<SiteRecord[]>([]);
  private readonly names = signal<Record<string, string | null>>({});
  private loadedFor: string | null = null;

  protected readonly edit = computed(() => this.detail.caps().edit);
  protected readonly uploadBlocked = computed(
    () => !this.permissions.can(SITE_PERM.documentsUpload) || this.uploadForbidden(),
  );
  protected readonly canUpload = computed(() => this.edit() && !this.uploadBlocked());
  protected readonly canAttach = computed(
    () => this.edit() && this.permissions.can(SITE_PERM.documentsRead) && !this.docsForbidden(),
  );

  protected readonly groups = computed<KindGroup[]>(() => {
    const links = this.links() ?? [];
    return (Object.values(SiteDocumentKind) as SiteDocumentKind[])
      .map((kind) => ({ kind, links: links.filter((l) => l.kind === kind) }))
      .filter((g) => g.links.length > 0);
  });

  constructor() {
    effect(() => {
      const site = this.detail.site();
      if (!site || site.id === this.loadedFor) return;
      untracked(() => {
        this.load();
        this.loadDocs();
      });
    });
  }

  protected t(key: CatalogKey, params?: Record<string, string | number>): string {
    return this.catalog.t(key, params);
  }

  load(): void {
    const siteId = this.detail.site()?.id;
    if (!siteId) return;
    this.loadedFor = siteId;
    this.links.set(null);
    this.error.set(null);
    this.api.documents(siteId).subscribe({
      next: (links) => {
        this.links.set(links);
        this.resolveNames(links);
      },
      error: (err: unknown) =>
        this.error.set(
          err instanceof HttpErrorResponse ? friendly(this.errors.parse(err)) : String(err),
        ),
    });
    this.api.grouped(siteId).subscribe({
      next: (g) => this.records.set(g.groups.flatMap((x) => x.records)),
      error: () => this.records.set([]),
    });
  }

  /** A1 / BF-1: without `documents.read` the read is skipped; a 403 hides Attach and names. */
  private loadDocs(): void {
    const projectId = this.detail.site()?.projectId;
    if (!projectId) return;
    if (!this.permissions.can(SITE_PERM.documentsRead)) {
      this.docsForbidden.set(true);
      return;
    }
    this.lookup.projectDocuments(projectId).subscribe({
      next: (docs) => {
        this.docs.set(docs);
        this.docsForbidden.set(false);
      },
      error: (err: unknown) => {
        this.docs.set(null);
        if (err instanceof HttpErrorResponse && err.status === 403) this.docsForbidden.set(true);
      },
    });
  }

  protected kindLabel(kind: number): string {
    return this.t(SITE_DOCUMENT_KIND_LABEL[kind] ?? 'sv.none');
  }

  protected fileName(d: SiteDocumentLink): string {
    return this.docs()?.find((x) => x.id === d.documentId)?.fileName || this.t('sv.document');
  }

  protected subject(d: SiteDocumentLink): string {
    if (!d.recordId) return this.t('sv.wholeSurvey');
    const r = this.records().find((x) => x.id === d.recordId);
    return r ? `${this.moduleCode(r.moduleId)} · ${r.label}` : '—';
  }

  protected name(id: string): string {
    return this.names()[id] ?? '—';
  }

  protected date(iso: string): string {
    return iso ? formatCairoDate(iso, this.catalog.locale()) : '—';
  }

  private moduleCode(moduleId: string): string {
    return (
      this.detail.modules().find((m) => m.id === moduleId)?.code ??
      this.detail.site()?.recordCounts.find((c) => c.moduleId === moduleId)?.code ??
      '—'
    );
  }

  private subjectOptions(): SelectOption[] {
    return [
      { value: null, label: this.t('sv.wholeSurvey') },
      ...this.records().map((r) => ({
        value: r.id,
        label: `${this.moduleCode(r.moduleId)} · ${r.label}`,
      })),
    ];
  }

  protected open(mode: 'upload' | 'link'): void {
    if (this.busy()) return;
    this.actionError.set(null);
    const data: SiteDocumentDialogData = {
      mode,
      documents: (this.docs() ?? []).map((d) => ({ value: d.id, label: d.fileName })),
      subjects: this.subjectOptions(),
      save: (req) => this.save(req),
    };
    this.modal.open(SiteDocumentDialogComponent, { size: 'md', data });
  }

  /** Files this page uploaded to the project documents, by the dialog's `File` (A4). */
  private readonly uploaded = new WeakMap<File, string>();

  /** Upload (when a file is given) then link (R19). */
  async save(req: SiteDocumentDialogRequest): Promise<WriteOutcome> {
    const site = this.detail.site();
    if (!site || this.busy()) return { ok: false, message: null };
    this.busy.set(true);
    let documentId = req.documentId;
    try {
      // A4: a file already uploaded whose link failed is not uploaded again; the retry links its id.
      const kept = req.file ? this.uploaded.get(req.file) : undefined;
      if (kept) documentId = kept;
      else if (req.file) {
        try {
          documentId = await firstValueFrom(this.lookup.uploadDocument(site.projectId, req.file));
          if (documentId) this.uploaded.set(req.file, documentId);
        } catch (err) {
          if (err instanceof HttpErrorResponse && err.status === 403)
            this.uploadForbidden.set(true);
          return failureOutcome(err, (e) => this.errors.parse(e));
        }
        this.loadDocs();
      }
      if (!documentId) return { ok: false, message: null };
      try {
        await firstValueFrom(
          this.api.linkDocument(site.id, { documentId, kind: req.kind, recordId: req.recordId }),
        );
      } catch (err) {
        const outcome = this.fail(err);
        if (req.file && outcome.message) {
          return { ...outcome, message: this.t('sv.uploadedNotLinked', { m: outcome.message }) };
        }
        return outcome;
      }
      this.toast.show({
        tone: 'success',
        message: this.t(req.file ? 'sv.uploaded' : 'sv.linked'),
      });
      this.load();
      return { ok: true };
    } finally {
      this.busy.set(false);
    }
  }

  protected async detach(d: SiteDocumentLink): Promise<void> {
    const site = this.detail.site();
    if (!site || this.busy()) return;
    const ok = await this.confirm.open({
      title: this.t('sv.unlinkQ'),
      body: this.t('sv.unlinkBody'),
      confirmLabel: this.t('sv.unlink'),
      cancelLabel: this.t('sv.cancel'),
      tone: 'danger',
    });
    if (!ok) return;
    this.busy.set(true);
    this.actionError.set(null);
    try {
      await firstValueFrom(this.api.unlinkDocument(site.id, d.id));
      this.toast.show({ tone: 'success', message: this.t('sv.unlinked') });
      this.load();
    } catch (err) {
      const outcome = this.fail(err);
      if (outcome.message) this.actionError.set(outcome.message);
    } finally {
      this.busy.set(false);
    }
  }

  /** Write refusals: conflicts reload; a lock / level / closed refusal re-reads the survey (U3). */
  private fail(err: unknown): WriteOutcome {
    if (this.reloadOnConflict(err, () => this.reloadAll())) return { ok: false, reloaded: true };
    const outcome = failureOutcome(err, (e) => this.errors.parse(e));
    switch (outcome.code) {
      case 'sites.SiteLocked':
      case 'sites.InsufficientLevel':
      case 'sites.ProjectClosed':
        this.detail.afterCapture(outcome.code);
        break;
      case 'sites.DocumentNotFound':
        this.load();
        this.loadDocs();
        break;
    }
    return outcome;
  }

  private reloadAll(): void {
    this.detail.reload();
    this.load();
  }

  private resolveNames(links: SiteDocumentLink[]): void {
    for (const id of new Set(links.map((l) => l.addedById))) {
      if (!id || id in this.names()) continue;
      this.names.update((n) => ({ ...n, [id]: null }));
      this.lookup.employeeName(id).subscribe((name) => {
        this.names.update((n) => ({ ...n, [id]: name }));
      });
    }
  }
}

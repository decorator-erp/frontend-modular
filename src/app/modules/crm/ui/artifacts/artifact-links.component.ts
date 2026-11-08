import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import {
  ConfirmService,
  PeraAlertComponent,
  PeraButtonComponent,
  PeraEmptyComponent,
  PeraIconComponent,
  PeraSkeletonComponent,
} from '@ds';
import { ProjectAccessStore, ProjectDocument, ProjectDocumentsService } from '@modules/projects';
import { ToastService } from '@platform/feedback/toast.service';
import { ErrorHandlerService, friendly } from '@platform/http/error-handler.service';
import { CatalogService } from '@platform/i18n/catalog.service';
import { PERM } from '@platform/permissions';
import { PermissionsService } from '@platform/permissions/permissions.service';
import { CrmArtifactService } from '../../data/crm-artifact.service';
import type { CrmArtifactLink, CrmArtifactSubject } from '../../model';

export const ARTIFACT_PAGE_SIZE = 20;

/**
 * crmp C-7: the documents linked to one CRM subject (contract §2.12). Pages the by-subject list
 * (#70–#73, a plain array: "Load more" while the last page was full) and offers unlink (#120) only to
 * the employee who linked it or a `crm.artifacts.manage` holder; 403 `crm.artifacts.NotLinker` and 404
 * `crm.artifacts.LinkNotFound` show the catalog message. Document names come from the project's
 * documents list; an unknown one shows a generic label.
 */
@Component({
  selector: 'app-crm-artifact-links',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    PeraAlertComponent,
    PeraButtonComponent,
    PeraEmptyComponent,
    PeraIconComponent,
    PeraSkeletonComponent,
  ],
  host: { class: 'block' },
  template: `
    @if (canRead()) {
      <section class="bg-surface border border-border rounded-card flex flex-col gap-3 p-4">
        <h3 class="fs-body font-semibold text-text-primary m-0">
          {{ catalog.t('artifacts.title') }}
        </h3>
        @if (error(); as message) {
          <pera-alert tone="warning">
            {{ message }}
            <pera-button variant="secondary" size="sm" (click)="reload()">{{
              catalog.t('artifacts.retry')
            }}</pera-button>
          </pera-alert>
        } @else if (loading() && links().length === 0) {
          <div class="flex flex-col gap-2" aria-busy="true">
            <pera-skeleton [height]="32" />
            <pera-skeleton [height]="32" />
          </div>
        } @else {
          @if (actionError(); as message) {
            <pera-alert tone="danger">{{ message }}</pera-alert>
          }
          <ul class="flex flex-col gap-2 m-0 p-0 list-none" data-links>
            @for (link of links(); track link.id) {
              <li class="flex items-center gap-2 fs-body-sm" data-link>
                <pera-icon name="file" [size]="14" class="text-text-muted" />
                <span class="flex-1 min-w-0 truncate text-text-primary" dir="auto">{{
                  docName(link)
                }}</span>
                @if (canUnlink(link)) {
                  <button
                    type="button"
                    class="p-1 rounded hover:bg-surface-muted text-danger disabled:opacity-40"
                    [disabled]="busy()"
                    [attr.aria-label]="catalog.t('artifacts.unlinkAria', { name: docName(link) })"
                    (click)="unlink(link)"
                  >
                    <pera-icon name="x" [size]="14" />
                  </button>
                }
              </li>
            } @empty {
              <pera-empty [title]="catalog.t('artifacts.empty')" />
            }
          </ul>
          @if (hasMore()) {
            <div>
              <pera-button
                variant="secondary"
                size="sm"
                [loading]="loading()"
                [disabled]="loading()"
                (click)="loadMore()"
                >{{ catalog.t('artifacts.loadMore') }}</pera-button
              >
            </div>
          }
        }
      </section>
    }
  `,
})
export class CrmArtifactLinksComponent {
  private readonly api = inject(CrmArtifactService);
  private readonly documentsApi = inject(ProjectDocumentsService);
  private readonly access = inject(ProjectAccessStore);
  private readonly permissions = inject(PermissionsService);
  private readonly errors = inject(ErrorHandlerService);
  private readonly confirm = inject(ConfirmService);
  private readonly toast = inject(ToastService);
  protected readonly catalog = inject(CatalogService);

  readonly subject = input.required<CrmArtifactSubject>();
  readonly subjectId = input.required<string>();
  readonly projectId = input.required<string>();

  protected readonly links = signal<CrmArtifactLink[]>([]);
  protected readonly loading = signal(false);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly actionError = signal<string | null>(null);
  protected readonly hasMore = signal(false);
  private readonly docs = signal<Map<string, ProjectDocument>>(new Map());
  /** Bumped on every reset so a late page of a previous subject is dropped. */
  private generation = 0;

  protected readonly canRead = computed(() => this.permissions.can(PERM.crm.artifacts.read));
  private readonly canManage = computed(() => this.permissions.can(PERM.crm.artifacts.manage));

  constructor() {
    effect(() => {
      const subjectId = this.subjectId();
      const projectId = this.projectId();
      this.subject();
      if (!subjectId || !this.canRead()) return;
      untracked(() => {
        if (projectId) {
          this.access.ensure(projectId);
          this.documentsApi
            .getByProject(projectId)
            .pipe(catchError(() => of<ProjectDocument[]>([])))
            .subscribe((list) => this.docs.set(new Map(list.map((d) => [d.id, d]))));
        }
        this.reload();
      });
    });
  }

  /** Only the employee who linked it, or a `crm.artifacts.manage` holder (#120). */
  protected canUnlink(link: CrmArtifactLink): boolean {
    if (this.canManage()) return true;
    const me = this.access.me();
    return !!me && link.addedByEmployeeId === me;
  }

  protected docName(link: CrmArtifactLink): string {
    return this.docs().get(link.documentId)?.fileName ?? this.catalog.t('artifacts.document');
  }

  reload(): void {
    this.generation++;
    // A7: a page still in flight belongs to the old generation and is dropped; it must not block this one.
    this.loading.set(false);
    this.links.set([]);
    this.error.set(null);
    this.actionError.set(null);
    this.loadMore();
  }

  loadMore(): void {
    if (this.loading()) return;
    const gen = this.generation;
    // A7: offset paging (#70–#73, GetCrmArtifactDocumentsQueryHandlers.cs:65-66). After an unlink
    // the server window shifts left, so ask for the page holding the next unseen row and drop repeats.
    const next = Math.floor(this.links().length / ARTIFACT_PAGE_SIZE) + 1;
    this.loading.set(true);
    this.api.listBySubject(this.subject(), this.subjectId(), next, ARTIFACT_PAGE_SIZE).subscribe({
      next: (rows) => {
        if (gen !== this.generation) return;
        this.links.update((all) => {
          const seen = new Set(all.map((l) => l.id));
          return [...all, ...rows.filter((l) => !seen.has(l.id))];
        });
        // A plain array (no totalCount): a short page is the last one.
        this.hasMore.set(rows.length === ARTIFACT_PAGE_SIZE);
        this.loading.set(false);
      },
      error: (err: unknown) => {
        if (gen !== this.generation) return;
        this.loading.set(false);
        this.hasMore.set(false);
        this.error.set(
          err instanceof HttpErrorResponse
            ? friendly(this.errors.parse(err))
            : this.catalog.t('artifacts.loadFailed'),
        );
      },
    });
  }

  protected async unlink(link: CrmArtifactLink): Promise<void> {
    if (this.busy()) return;
    const ok = await this.confirm.open({
      title: this.catalog.t('artifacts.unlinkTitle'),
      body: this.catalog.t('artifacts.unlinkConfirm', { name: this.docName(link) }),
      confirmLabel: this.catalog.t('artifacts.unlink'),
      cancelLabel: this.catalog.t('space.cancel'),
      tone: 'danger',
    });
    if (!ok) return;
    this.busy.set(true);
    this.actionError.set(null);
    this.api.unlink(link.id).subscribe({
      next: () => {
        this.busy.set(false);
        this.links.update((all) => all.filter((l) => l.id !== link.id));
        this.toast.show({ tone: 'success', message: this.catalog.t('artifacts.unlinked') });
      },
      error: (err: unknown) => {
        this.busy.set(false);
        const parsed = err instanceof HttpErrorResponse ? this.errors.parse(err) : null;
        if (parsed?.code === 'crm.artifacts.LinkNotFound') this.reload();
        this.actionError.set(parsed ? friendly(parsed) : this.catalog.t('artifacts.unlinkFailed'));
      },
    });
  }
}

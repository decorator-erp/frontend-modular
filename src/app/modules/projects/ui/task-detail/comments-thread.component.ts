import { ChangeDetectionStrategy, Component, OnInit, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { TaskCommentService } from '../../data/task-comment.service';
import { ErrorHandlerService, friendly } from '@platform/http/error-handler.service';
import { ToastService } from '@platform/feedback/toast.service';
import { MarkdownService } from '@shared/markdown/markdown.service';
import { LocaleService } from '@platform/i18n';
import { CatalogService } from '@platform/i18n/catalog.service';
import { PERM } from '@platform/permissions';
import { CanDirective } from '@platform/permissions';
import { TaskComment } from '../../model/project.model';
import { ProjectAccessStore } from '../../stores/project-access.store';
import { formatShortDate } from '@shared/ui/status';
import { ConfirmService, PeraAvatarComponent, PeraButtonComponent } from '@ds';

/**
 * View model for a rendered comment. Extends the API `TaskComment` with the
 * optional presentation fields the DMS design shows (role badge, an Arabic
 * translation line, a reaction count). The backend doesn't supply these yet,
 * so each is guarded with `@if` in the template and stays absent until a
 * future API exposes them.
 */
interface CommentVm extends TaskComment {
  role?: string | null;
  contentAr?: string | null;
  reactions?: number | null;
}

/**
 * Comments thread (A-06 pattern) — `/api/projects/{projectId}/tasks/{taskId}/comments` (crmp A-2; was `/api/task-comments`) per
 * api-docs/09-documents-attachments-comments.md. Create/edit/delete gated by
 * Projects.ManageTasks; the backend additionally restricts edit/delete to the
 * author or task assignee (task_comments.NotAuthorized).
 *
 * Reskinned to the DMS Task Detail "Comments" view (design lines 177-196 /
 * 545-585): a top composer (avatar + bordered box with an editor field and a
 * tools bar) followed by one `.cmt` row per comment (avatar + body with a
 * name/role/time header, the text, and a reactions row). Parent wraps this in a
 * `<pera-card>`, so we render the card BODY only — no outer border/header.
 */
/** crmp A-4: one page of comments; the backend's own default when paged is 200. */
export const COMMENT_PAGE_SIZE = 50;

@Component({
  selector: 'app-comments-thread',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, CanDirective, PeraAvatarComponent, PeraButtonComponent],
  template: `
    <!-- Composer (top, per A-06 / design .composer) -->
    <ng-container *peraCan="canAdd() ? addClaims : []">
      <div class="flex gap-3 p-4 border-b border-border-soft">
        <pera-avatar [name]="composerName()" size="md" />
        <div class="flex-1 min-w-0 border border-border bg-surface">
          <textarea
            placeholder="Add a comment… use @ to mention a teammate"
            rows="2"
            [ngModel]="draft()"
            (ngModelChange)="draft.set($event)"
            class="block w-full px-3 py-2 min-h-[var(--space-10)] font-sans fs-caption text-text-primary
                   placeholder:text-text-muted bg-transparent outline-0 resize-y"
          ></textarea>
          <div
            class="flex items-center gap-1.5 px-2.5 py-2 border-t border-border-soft bg-surface-muted"
          >
            <span class="flex-1"></span>
            <pera-button
              variant="primary"
              size="sm"
              [disabled]="!draft().trim() || busy()"
              (click)="submit()"
              >Comment</pera-button
            >
          </div>
        </div>
      </div>
    </ng-container>

    <!-- Comments (design .cmt) -->
    @for (c of comments(); track c.id) {
      <div class="group flex gap-3 px-4 py-4 border-b border-border-soft last:border-b-0">
        <pera-avatar [name]="c.employeeName || 'Member'" size="md" />
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2 mb-1">
            <span class="fs-caption font-semibold text-text-primary">{{
              c.employeeName || 'Member'
            }}</span>
            @if (c.role) {
              <span class="fs-label text-text-muted border border-border px-1.5 py-px">{{
                c.role
              }}</span>
            }
            <span class="fs-label text-text-muted tabular-nums">{{
              shortDate(c.createdAtUtc, locale.locale())
            }}</span>
            @if (c.updatedAtUtc) {
              <span class="fs-label text-text-muted uppercase tracking-wide">edited</span>
            }
            <span
              class="ms-auto opacity-0 group-hover:opacity-100 flex items-center gap-1.5 fs-label text-text-muted uppercase transition-opacity"
            >
              <ng-container *peraCan="canChange(c, 'comment.edit') ? readClaim : []">
                <button type="button" class="hover:text-accent" (click)="startEdit(c)" data-edit>
                  Edit
                </button>
                <span class="text-border">·</span>
                @if (canChange(c, 'comment.delete')) {
                  <button type="button" class="hover:text-danger" (click)="remove(c)" data-delete>
                    Delete
                  </button>
                }
              </ng-container>
            </span>
          </div>
          @if (editingId() === c.id) {
            <textarea
              rows="2"
              [ngModel]="editDraft()"
              (ngModelChange)="editDraft.set($event)"
              class="block w-full mt-1 border border-accent bg-surface px-3 py-2 font-sans fs-caption text-text-primary outline-0 resize-y"
            ></textarea>
            <div class="flex gap-2 mt-1 fs-label uppercase">
              <button type="button" class="text-accent hover:underline" (click)="saveEdit(c)">
                Save
              </button>
              <button
                type="button"
                class="text-text-muted hover:underline"
                (click)="editingId.set(null)"
              >
                Cancel
              </button>
            </div>
          } @else {
            <div
              class="md-out m-0 fs-caption leading-relaxed text-text-secondary"
              [innerHTML]="md.render(c.content)"
            ></div>
            @if (c.contentAr) {
              <span class="block mt-1 fs-caption text-text-muted" dir="rtl">{{ c.contentAr }}</span>
            }
            <div class="flex gap-2 mt-2">
              <span class="fs-label text-text-muted cursor-pointer hover:text-accent"
                >👍 {{ c.reactions || 0 }}</span
              >
              <span class="fs-label text-text-muted cursor-pointer hover:text-accent">Reply</span>
            </div>
          }
        </div>
      </div>
    } @empty {
      <p class="m-0 px-4 py-4 fs-caption text-text-muted">
        No comments yet. Be the first to add context.
      </p>
    }
    @if (hasMore()) {
      <div class="px-4 py-2">
        <pera-button variant="ghost" size="sm" [disabled]="loadingMore()" (click)="loadMore()">
          {{ loadingMore() ? catalog.t('projects.loadingMore') : catalog.t('projects.loadMore') }}
        </pera-button>
      </div>
    }
  `,
})
export class CommentsThreadComponent implements OnInit {
  readonly projectId = input.required<string>();
  readonly taskId = input.required<string>();

  private readonly api = inject(TaskCommentService);
  private readonly errors = inject(ErrorHandlerService);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmService);
  protected readonly md = inject(MarkdownService);
  readonly locale = inject(LocaleService);

  readonly manageTasks = PERM.stageTasks.manage;
  /** crmp P-6: add takes either execution claim (TaskEndpoints.cs:195); edit/delete route on read. */
  readonly addClaims = [PERM.stageTasks.manage, PERM.stageTasks.complete];
  readonly readClaim = PERM.stageTasks.read;
  private readonly access = inject(ProjectAccessStore);

  /** Add: Editor level and either claim (contract §2.17.2). */
  canAdd(): boolean {
    return this.access.can(this.projectId(), 'comment.add');
  }

  /**
   * Edit/delete: Editor level AND the author or the `stage_tasks.manage` claim — the claim, not the
   * Manager level (`projects.comments.NotAuthor`, dms TaskCommentHandlers.cs:87-107).
   */
  canChange(c: TaskComment, action: 'comment.edit' | 'comment.delete'): boolean {
    return this.access.canComment(this.projectId(), c, action);
  }
  readonly shortDate = formatShortDate;

  /** Avatar seed for the composer; falls back to a neutral label when no user. */
  protected readonly composerName = signal('Member');

  readonly comments = signal<CommentVm[]>([]);
  readonly draft = signal('');
  readonly busy = signal(false);
  readonly editingId = signal<string | null>(null);
  readonly editDraft = signal('');
  readonly hasMore = signal(false);
  readonly loadingMore = signal(false);
  protected readonly catalog = inject(CatalogService);
  private page = 1;

  ngOnInit(): void {
    this.load();
  }

  /**
   * crmp A-4: comments are read a page at a time (opt-in paging, contract §1.6). A page shorter than
   * the page size is the last one; "Load more" appends the next page.
   */
  load(): void {
    this.page = 1;
    this.api
      .getByTask(this.projectId(), this.taskId(), { pageNumber: 1, pageSize: COMMENT_PAGE_SIZE })
      .subscribe((list) => {
        this.comments.set(list);
        this.hasMore.set(list.length === COMMENT_PAGE_SIZE);
      });
  }

  loadMore(): void {
    if (this.loadingMore() || !this.hasMore()) return;
    this.loadingMore.set(true);
    const next = this.page + 1;
    this.api
      .getByTask(this.projectId(), this.taskId(), { pageNumber: next, pageSize: COMMENT_PAGE_SIZE })
      .subscribe({
        next: (list) => {
          this.page = next;
          const seen = new Set(this.comments().map((c) => c.id));
          this.comments.update((all) => [...all, ...list.filter((c) => !seen.has(c.id))]);
          this.hasMore.set(list.length === COMMENT_PAGE_SIZE);
          this.loadingMore.set(false);
        },
        error: (err: HttpErrorResponse) => {
          this.loadingMore.set(false);
          this.toast.show({ tone: 'danger', message: friendly(this.errors.parse(err)) });
        },
      });
  }

  submit(): void {
    const content = this.draft().trim();
    if (!content || this.busy()) return;
    this.busy.set(true);
    this.api.create(this.projectId(), this.taskId(), content).subscribe({
      next: () => {
        this.draft.set('');
        this.busy.set(false);
        this.load();
      },
      error: (err: HttpErrorResponse) => {
        this.busy.set(false);
        this.toast.show({ tone: 'danger', message: friendly(this.errors.parse(err)) });
      },
    });
  }

  startEdit(c: TaskComment): void {
    this.editingId.set(c.id);
    this.editDraft.set(c.content);
  }

  saveEdit(c: TaskComment): void {
    const content = this.editDraft().trim();
    if (!content || this.busy()) return;
    this.busy.set(true);
    this.api.update(this.projectId(), this.taskId(), c.id, content).subscribe({
      next: () => {
        this.comments.update((list) =>
          list.map((x) =>
            x.id === c.id ? { ...x, content, updatedAtUtc: new Date().toISOString() } : x,
          ),
        );
        this.editingId.set(null);
        this.busy.set(false);
      },
      error: (err: HttpErrorResponse) => {
        this.busy.set(false);
        this.toast.show({ tone: 'danger', message: friendly(this.errors.parse(err)) });
      },
    });
  }

  async remove(c: TaskComment): Promise<void> {
    const ok = await this.confirm.open({
      title: 'Delete comment',
      body: 'Delete this comment? This cannot be undone.',
      confirmLabel: 'Delete',
      tone: 'danger',
    });
    if (!ok) return;
    this.api.remove(this.projectId(), this.taskId(), c.id).subscribe({
      next: () => this.comments.update((list) => list.filter((x) => x.id !== c.id)),
      error: (err: HttpErrorResponse) =>
        this.toast.show({ tone: 'danger', message: friendly(this.errors.parse(err)) }),
    });
  }
}

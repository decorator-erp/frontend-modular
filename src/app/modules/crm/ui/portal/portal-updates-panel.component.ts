import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  Injector,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { ToastService } from '@platform/feedback/toast.service';
import { ErrorHandlerService, friendly } from '@platform/http/error-handler.service';
import { CatalogService } from '@platform/i18n/catalog.service';
import { formatCairoDateTime } from '@platform/i18n/intl-locale';
import {
  ConfirmService,
  ModalService,
  PeraAlertComponent,
  PeraButtonComponent,
  PeraEmptyComponent,
  PeraSkeletonComponent,
  PeraStatusBadgeComponent,
} from '@ds';
import { CrmPortalVisibilityService } from '../../data/crm-portal-visibility.service';
import type { PortalUpdateDraft } from '../../model/portal.model';
import { PortalSharesStore } from '../../stores/portal-shares.store';
import {
  CrmPortalUpdateDialogComponent,
  type PortalUpdateDialogData,
} from './portal-update-dialog.component';

type LoadState = 'loading' | 'ready' | 'error';

/**
 * crmp P2-B: the project's client updates (`GET …/portal/updates`, drafts included, newest first).
 * Write and edit (title, text, attached shares), publish with "Notify the client", delete with a
 * confirm. Writes need `crm.portal.manage`; one at a time.
 */
@Component({
  selector: 'app-crm-portal-updates-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    PeraAlertComponent,
    PeraButtonComponent,
    PeraEmptyComponent,
    PeraSkeletonComponent,
    PeraStatusBadgeComponent,
  ],
  host: { class: 'flex flex-col gap-4' },
  template: `
    @if (canManage()) {
      <div class="flex justify-end">
        <pera-button
          variant="primary"
          [disabled]="busy()"
          data-testid="new-update"
          (click)="openEditor(null)"
          >{{ catalog.t('pportal.newUpdate') }}</pera-button
        >
      </div>
    }
    @if (error(); as message) {
      <pera-alert tone="danger" data-testid="updates-error">{{ message }}</pera-alert>
    }
    @switch (state()) {
      @case ('loading') {
        <div class="flex flex-col gap-2">
          <pera-skeleton [height]="56" />
          <pera-skeleton [height]="56" />
        </div>
      }
      @case ('error') {
        <pera-alert tone="danger">
          <div class="flex items-center gap-3">
            <span class="flex-1">{{ catalog.t('pportal.loadFailed') }}</span>
            <pera-button variant="secondary" size="xs" (click)="load()">{{
              catalog.t('common.retry')
            }}</pera-button>
          </div>
        </pera-alert>
      }
      @default {
        @if (updates().length) {
          <ul class="flex flex-col gap-2 m-0 p-0 list-none">
            @for (u of updates(); track u.id) {
              <li
                class="flex flex-col gap-2 p-3 border border-border bg-surface rounded-card"
                data-testid="update-row"
              >
                <div class="flex flex-wrap items-center justify-between gap-2">
                  <span class="fs-body-sm font-semibold text-text-primary" dir="auto">{{
                    u.title
                  }}</span>
                  <pera-status-badge
                    [tone]="u.publishedAtUtc ? 'success' : 'neutral'"
                    [label]="catalog.t(u.publishedAtUtc ? 'pportal.published' : 'pportal.draft')"
                  />
                </div>
                @if (u.body) {
                  <p
                    class="m-0 fs-caption text-text-secondary whitespace-pre-line line-clamp-3"
                    dir="auto"
                  >
                    {{ u.body }}
                  </p>
                }
                <div class="flex flex-wrap items-center gap-x-3 fs-caption text-text-muted">
                  <span>{{
                    u.publishedAtUtc
                      ? catalog.t('pportal.publishedOn', { date: when(u.publishedAtUtc) })
                      : catalog.t('pportal.createdOn', { date: when(u.createdAtUtc) })
                  }}</span>
                  @if (u.shareIds.length) {
                    <span>{{ catalog.t('pportal.attachCount', { n: u.shareIds.length }) }}</span>
                  }
                </div>
                @if (canManage()) {
                  <div class="flex flex-wrap items-center gap-2">
                    @if (!u.publishedAtUtc) {
                      <pera-button
                        variant="primary"
                        size="xs"
                        [disabled]="busy()"
                        data-testid="publish"
                        (click)="publish(u)"
                        >{{ catalog.t('pportal.publish')
                        }}<span class="sr-only" dir="auto"> {{ u.title }}</span></pera-button
                      >
                    }
                    <pera-button
                      variant="ghost"
                      size="xs"
                      [disabled]="busy()"
                      data-testid="edit-update"
                      (click)="openEditor(u)"
                      >{{ catalog.t('common.edit')
                      }}<span class="sr-only" dir="auto"> {{ u.title }}</span></pera-button
                    >
                    <pera-button
                      variant="ghost"
                      size="xs"
                      [disabled]="busy()"
                      data-testid="delete-update"
                      (click)="remove(u)"
                      >{{ catalog.t('common.delete')
                      }}<span class="sr-only" dir="auto"> {{ u.title }}</span></pera-button
                    >
                  </div>
                }
              </li>
            }
          </ul>
        } @else {
          <pera-empty [title]="catalog.t('pportal.noUpdates')" />
        }
      }
    }
  `,
})
export class CrmPortalUpdatesPanelComponent {
  private readonly api = inject(CrmPortalVisibilityService);
  private readonly shares = inject(PortalSharesStore);
  private readonly errors = inject(ErrorHandlerService);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmService);
  private readonly modal = inject(ModalService);
  private readonly injector = inject(Injector);
  protected readonly catalog = inject(CatalogService);

  readonly projectId = input.required<string>();
  readonly canManage = input(false);
  /** An update was written, published or deleted (the preview re-reads). */
  readonly changed = output<void>();

  readonly state = signal<LoadState>('loading');
  readonly updates = signal<PortalUpdateDraft[]>([]);
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);

  constructor() {
    effect(() => {
      const projectId = this.projectId();
      untracked(() => {
        this.shares.ensure(projectId);
        this.load();
      });
    });
  }

  load(): void {
    this.state.set('loading');
    this.api.getUpdates(this.projectId()).subscribe({
      next: (list) => {
        this.updates.set(
          [...list].sort((a, b) =>
            (b.publishedAtUtc ?? b.createdAtUtc).localeCompare(a.publishedAtUtc ?? a.createdAtUtc),
          ),
        );
        this.state.set('ready');
      },
      error: () => this.state.set('error'),
    });
  }

  protected when(iso: string): string {
    return iso ? formatCairoDateTime(iso, this.catalog.locale()) : '—';
  }

  async openEditor(update: PortalUpdateDraft | null): Promise<void> {
    if (this.busy() || !this.canManage()) return;
    const projectId = this.projectId();
    const data: PortalUpdateDialogData = {
      mode: update ? 'edit' : 'create',
      projectId,
      shares: this.shares.shares(projectId),
      update: update ?? undefined,
    };
    await this.runDialog(data);
  }

  async publish(update: PortalUpdateDraft): Promise<void> {
    if (this.busy() || !this.canManage()) return;
    await this.runDialog({ mode: 'publish', projectId: this.projectId(), update });
  }

  async remove(update: PortalUpdateDraft): Promise<void> {
    if (this.busy() || !this.canManage()) return;
    this.busy.set(true);
    const ok = await this.confirm.open({
      title: this.catalog.t('pportal.deleteUpdateTitle'),
      body: this.catalog.t('pportal.deleteUpdateBody', { title: update.title }),
      confirmLabel: this.catalog.t('common.delete'),
      cancelLabel: this.catalog.t('common.cancel'),
      tone: 'danger',
    });
    if (!ok) {
      this.busy.set(false);
      return;
    }
    this.error.set(null);
    this.api.deleteUpdate(this.projectId(), update.id).subscribe({
      next: () => {
        this.busy.set(false);
        this.toast.show({ tone: 'success', message: this.catalog.t('pportal.updateDeleted') });
        this.load();
        this.changed.emit();
      },
      error: (err: HttpErrorResponse) => {
        this.busy.set(false);
        this.error.set(friendly(this.errors.parse(err)));
        this.load();
      },
    });
  }

  private async runDialog(data: PortalUpdateDialogData): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    const ok = await this.modal
      .open<boolean>(CrmPortalUpdateDialogComponent, { size: 'md', data, injector: this.injector })
      .afterClosed();
    this.busy.set(false);
    if (ok) {
      this.load();
      this.changed.emit();
    }
  }
}

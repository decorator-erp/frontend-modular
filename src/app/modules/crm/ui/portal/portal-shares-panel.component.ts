import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  Injector,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { ToastService } from '@platform/feedback/toast.service';
import { ErrorHandlerService, friendly } from '@platform/http/error-handler.service';
import { CatalogService } from '@platform/i18n/catalog.service';
import {
  ConfirmService,
  ModalService,
  PeraAlertComponent,
  PeraBadgeComponent,
  PeraButtonComponent,
  PeraEmptyComponent,
  PeraIconComponent,
  PeraSelectComponent,
  PeraSkeletonComponent,
  type SelectOption,
} from '@ds';
import { CrmPortalVisibilityService } from '../../data/crm-portal-visibility.service';
import {
  PORTAL_SHARE_KINDS,
  followsLatest,
  type PortalShare,
  type PortalShareKind,
} from '../../model/portal.model';
import { PortalSharesStore } from '../../stores/portal-shares.store';
import { portalKindKey, portalKindTone, shareDisplayName } from './portal-labels';
import {
  CrmPortalShareDialogComponent,
  type PortalShareDialogData,
} from './portal-share-dialog.component';
import {
  CrmPortalSharePickerComponent,
  type PortalSharePickerData,
} from './portal-share-picker.component';

/**
 * crmp P2-B: "Shared with client" — the project's active shares in display order (`PortalSharesStore`).
 * Each row: kind badge, the client title (else the item name), an Unavailable marker for a vanished
 * source, move up / down (`PUT …/shares/order`), edit (title, note, follow-latest) and unshare (with a
 * confirm). Filter by kind. Writes need `crm.portal.manage`; one write at a time.
 */
@Component({
  selector: 'app-crm-portal-shares-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    PeraAlertComponent,
    PeraBadgeComponent,
    PeraButtonComponent,
    PeraEmptyComponent,
    PeraIconComponent,
    PeraSelectComponent,
    PeraSkeletonComponent,
  ],
  host: { class: 'flex flex-col gap-4' },
  template: `
    <div class="flex flex-wrap items-end justify-between gap-3">
      <div class="w-48">
        <pera-select
          [formControl]="kindFilter"
          [options]="filterOptions"
          [ariaLabel]="catalog.t('pportal.filterKind')"
        />
      </div>
      @if (canManage()) {
        <pera-button variant="primary" data-testid="add-share" (click)="openPicker()">{{
          catalog.t('pportal.addShare')
        }}</pera-button>
      }
    </div>

    @if (error(); as message) {
      <pera-alert tone="danger" data-testid="shares-error">{{ message }}</pera-alert>
    }

    @switch (store.state(projectId())) {
      @case ('error') {
        <pera-alert tone="danger">
          <div class="flex items-center gap-3">
            <span class="flex-1">{{ catalog.t('pportal.loadFailed') }}</span>
            <pera-button variant="secondary" size="xs" (click)="store.refresh(projectId())">{{
              catalog.t('common.retry')
            }}</pera-button>
          </div>
        </pera-alert>
      }
      @case ('ready') {
        @if (visible().length) {
          <ol class="flex flex-col gap-2 m-0 p-0 list-none">
            @for (s of visible(); track s.id; let first = $first, last = $last) {
              <li
                class="flex items-center gap-3 p-3 border border-border bg-surface"
                [class.opacity-60]="!s.isAvailable"
                data-testid="share-row"
              >
                <pera-badge [tone]="tone(s.itemKind)" size="micro">{{
                  catalog.t(kindKey(s.itemKind))
                }}</pera-badge>
                <div class="min-w-0 flex-1">
                  <div class="flex flex-wrap items-center gap-2">
                    <span
                      class="fs-body-sm font-medium text-text-primary truncate"
                      dir="auto"
                      data-testid="share-name"
                      >{{ name(s) }}</span
                    >
                    @if (!s.isAvailable) {
                      <pera-badge tone="danger" size="micro" data-testid="unavailable">{{
                        catalog.t('pportal.unavailable')
                      }}</pera-badge>
                    }
                  </div>
                  <div class="fs-caption text-text-muted flex flex-wrap gap-x-3">
                    @if (s.clientTitle && s.itemName) {
                      <span dir="auto">{{
                        catalog.t('pportal.internalName', { name: s.itemName })
                      }}</span>
                    }
                    @if (s.stageName) {
                      <span dir="auto">{{
                        catalog.t('pportal.stageOf', { name: s.stageName })
                      }}</span>
                    }
                    @if (s.siteCode) {
                      <span dir="auto">{{
                        catalog.t('pportal.siteOf', { code: s.siteCode })
                      }}</span>
                    }
                    @if (s.version !== null) {
                      <span>{{ catalog.t('pportal.version', { n: s.version }) }}</span>
                    }
                    @if (s.followLatest && followable(s.itemKind)) {
                      <span>{{ catalog.t('pportal.followsLatest') }}</span>
                    }
                    @if (!s.isAvailable) {
                      <span>{{ catalog.t('pportal.unavailableHint') }}</span>
                    }
                  </div>
                  @if (s.clientNote) {
                    <div class="fs-caption text-text-secondary" dir="auto">{{ s.clientNote }}</div>
                  }
                </div>
                @if (canManage()) {
                  <div class="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      class="inline-flex p-1 text-text-secondary hover:text-text-primary disabled:opacity-40
                             cursor-pointer outline-none focus-visible:outline-2 focus-visible:outline-accent"
                      [attr.aria-label]="catalog.t('pportal.moveUp') + ': ' + name(s)"
                      [disabled]="busy() || first"
                      data-testid="move-up"
                      (click)="move(s, -1)"
                    >
                      <pera-icon name="arrow-up" [size]="16" />
                    </button>
                    <button
                      type="button"
                      class="inline-flex p-1 text-text-secondary hover:text-text-primary disabled:opacity-40
                             cursor-pointer outline-none focus-visible:outline-2 focus-visible:outline-accent"
                      [attr.aria-label]="catalog.t('pportal.moveDown') + ': ' + name(s)"
                      [disabled]="busy() || last"
                      data-testid="move-down"
                      (click)="move(s, 1)"
                    >
                      <pera-icon name="arrow-down" [size]="16" />
                    </button>
                    <pera-button
                      variant="ghost"
                      size="xs"
                      [disabled]="busy()"
                      data-testid="edit-share"
                      (click)="edit(s)"
                      >{{ catalog.t('pportal.editShare')
                      }}<span class="sr-only" dir="auto"> {{ name(s) }}</span></pera-button
                    >
                    <pera-button
                      variant="ghost"
                      size="xs"
                      [disabled]="busy()"
                      data-testid="unshare"
                      (click)="unshare(s)"
                      >{{ catalog.t('pportal.unshare')
                      }}<span class="sr-only" dir="auto"> {{ name(s) }}</span></pera-button
                    >
                  </div>
                }
              </li>
            }
          </ol>
        } @else {
          <pera-empty
            [title]="catalog.t(kind() === null ? 'pportal.noShares' : 'pportal.noSharesKind')"
          />
        }
      }
      @default {
        <div class="flex flex-col gap-2" data-testid="shares-loading">
          <pera-skeleton [height]="48" />
          <pera-skeleton [height]="48" />
        </div>
      }
    }
  `,
})
export class CrmPortalSharesPanelComponent {
  private readonly api = inject(CrmPortalVisibilityService);
  private readonly errors = inject(ErrorHandlerService);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmService);
  private readonly modal = inject(ModalService);
  private readonly injector = inject(Injector);
  protected readonly store = inject(PortalSharesStore);
  protected readonly catalog = inject(CatalogService);

  readonly projectId = input.required<string>();
  readonly canManage = input(false);
  /** A share was added, edited, moved or removed (the preview re-reads). */
  readonly changed = output<void>();

  readonly kindFilter = new FormControl<PortalShareKind | null>(null);
  protected readonly kind = toSignal(this.kindFilter.valueChanges, { initialValue: null });
  protected readonly filterOptions: SelectOption[] = [
    { value: null, label: this.catalog.t('pportal.allKinds') },
    ...PORTAL_SHARE_KINDS.map((k) => ({ value: k, label: this.catalog.t(portalKindKey(k)) })),
  ];

  readonly busy = signal(false);
  readonly error = signal<string | null>(null);

  protected readonly visible = computed(() => {
    const kind = this.kind();
    const all = this.store.shares(this.projectId());
    return kind === null ? all : all.filter((s) => s.itemKind === kind);
  });

  constructor() {
    // Once per page: re-read the project's shares when the tab opens.
    effect(() => {
      const projectId = this.projectId();
      untracked(() => this.store.ensure(projectId, true));
    });
  }

  protected name(share: PortalShare): string {
    return shareDisplayName(share);
  }

  protected kindKey(kind: PortalShareKind) {
    return portalKindKey(kind);
  }

  protected tone(kind: PortalShareKind) {
    return portalKindTone(kind);
  }

  protected followable(kind: PortalShareKind): boolean {
    return followsLatest(kind);
  }

  /** Swap with the neighbour in the visible list; the whole project order is written. */
  move(share: PortalShare, delta: -1 | 1): void {
    if (this.busy() || !this.canManage()) return;
    const visible = this.visible();
    const at = visible.findIndex((s) => s.id === share.id);
    const neighbour = visible[at + delta];
    if (at < 0 || !neighbour) return;
    const projectId = this.projectId();
    const before = this.store.shares(projectId);
    const order = before.map((s) => s.id);
    const i = order.indexOf(share.id);
    const j = order.indexOf(neighbour.id);
    [order[i], order[j]] = [order[j], order[i]];
    const byId = new Map(before.map((s) => [s.id, s]));
    this.store.setOrder(
      projectId,
      order.map((id) => byId.get(id)).filter((s): s is PortalShare => !!s),
    );
    this.busy.set(true);
    this.error.set(null);
    this.api.reorderShares(projectId, order).subscribe({
      next: () => {
        this.busy.set(false);
        this.changed.emit();
      },
      error: (err: HttpErrorResponse) => {
        this.busy.set(false);
        this.store.setOrder(projectId, before);
        this.error.set(friendly(this.errors.parse(err)));
        this.store.refresh(projectId);
      },
    });
  }

  async edit(share: PortalShare): Promise<void> {
    if (this.busy() || !this.canManage()) return;
    const data: PortalShareDialogData = { mode: 'edit', projectId: this.projectId(), share };
    this.busy.set(true);
    const ok = await this.modal
      .open<boolean>(CrmPortalShareDialogComponent, { size: 'md', data, injector: this.injector })
      .afterClosed();
    this.busy.set(false);
    if (ok) this.changed.emit();
  }

  async openPicker(): Promise<void> {
    if (this.busy() || !this.canManage()) return;
    const data: PortalSharePickerData = { projectId: this.projectId() };
    this.busy.set(true);
    const ok = await this.modal
      .open<boolean>(CrmPortalSharePickerComponent, { size: 'md', data, injector: this.injector })
      .afterClosed();
    this.busy.set(false);
    if (ok) this.changed.emit();
  }

  async unshare(share: PortalShare): Promise<void> {
    if (this.busy() || !this.canManage()) return;
    this.busy.set(true);
    const ok = await this.confirm.open({
      title: this.catalog.t('pportal.unshareTitle'),
      body: this.catalog.t('pportal.unshareBody', { name: this.name(share) }),
      confirmLabel: this.catalog.t('pportal.unshare'),
      cancelLabel: this.catalog.t('common.cancel'),
      tone: 'danger',
    });
    if (!ok) {
      this.busy.set(false);
      return;
    }
    const projectId = this.projectId();
    this.error.set(null);
    this.api.deleteShare(projectId, share.id).subscribe({
      next: () => {
        this.busy.set(false);
        this.store.refresh(projectId);
        this.toast.show({ tone: 'success', message: this.catalog.t('pportal.unshared') });
        this.changed.emit();
      },
      error: (err: HttpErrorResponse) => {
        this.busy.set(false);
        this.error.set(friendly(this.errors.parse(err)));
        this.store.refresh(projectId);
      },
    });
  }
}

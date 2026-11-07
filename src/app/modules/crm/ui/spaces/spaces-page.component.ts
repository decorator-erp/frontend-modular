import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  Injector,
  signal,
} from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { CatalogService } from '@platform/i18n/catalog.service';
import { CanDirective, PERM } from '@platform/permissions';
import { ToastService } from '@platform/feedback/toast.service';
import { friendly } from '@platform/http/error-handler.service';
import type { CrmSpace } from '../../model';
import {
  ConfirmService,
  ModalService,
  PeraAlertComponent,
  PeraButtonComponent,
  PeraIconComponent,
  PeraPageHeaderComponent,
} from '@ds';
import { SpacesStore } from '../../stores/spaces.store';
import { CrmSpaceBriefNoteComponent } from './space-brief-note.component';
import { AddSpaceDialogData, CrmAddSpaceDialogComponent } from './add-space-dialog.component';

/**
 * `/crm/projects/:projectId/spaces` — the project's rooms. A spaces rail and the selected
 * space's brief note. Two spaces of one type ("Kids room 1" / "Kids room 2") is the whole point.
 *
 * 009b #N-5: no space-item routes exist on the backend, so the board and completeness panels
 * and the storefront route are gone. crmp C-5: the rail offers keyboard-reachable move up /
 * move down (real buttons, labelled; the FULL order is sent), rename, activate/deactivate and
 * delete (409 `crm.spaces.InUse` → offer deactivate). Writes need `crm.spaces.manage`.
 */
@Component({
  selector: 'app-crm-spaces-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block bg-bg min-h-full' },
  imports: [
    RouterLink,
    CanDirective,
    PeraAlertComponent,
    PeraPageHeaderComponent,
    PeraButtonComponent,
    PeraIconComponent,
    CrmSpaceBriefNoteComponent,
  ],
  template: `
    <pera-page-header [title]="catalog.t('space.title')" [count]="store.spaces().length">
      <div toolbar>
        <a routerLink="provisioning" class="fs-caption text-accent hover:underline">{{
          catalog.t('space.provisioningLink')
        }}</a>
      </div>
      <div actions *peraCan="PERM.crm.spaces.manage">
        <pera-button variant="primary" iconStart="plus" (click)="addSpace()">{{
          catalog.t('space.addSpace')
        }}</pera-button>
      </div>
    </pera-page-header>

    <!--
      One alert for the whole screen — the rail, board and completeness rail are parts of
      this page and all write into the same store error.
    -->
    @if (store.error(); as failure) {
      <div class="px-6 pt-4">
        <pera-alert tone="danger">{{ catalog.t(failure) }}</pera-alert>
      </div>
    }

    <div class="p-6 grid grid-cols-1 lg:grid-cols-[var(--w-rail)_minmax(0,1fr)] gap-6 items-start">
      <!--
        Spaces rail. A row is NOT one wrapping <button> — the actions beside it would then
        be nested buttons, which is invalid. Same shape as the catalog children list: a
        flex-1 select button plus separate action columns.
      -->
      <aside class="flex flex-col gap-2">
        @for (space of store.spaces(); track space.id; let first = $first, last = $last) {
          <div
            class="flex items-stretch gap-1 rounded-card border bg-surface"
            [class.border-accent]="space.id === selectedId()"
            [class.border-border]="space.id !== selectedId()"
            [class.opacity-50]="!space.isActive"
          >
            <button
              type="button"
              class="flex-1 min-w-0 text-start px-4 py-3 hover:bg-surface-muted"
              (click)="selectedId.set(space.id)"
            >
              <div class="flex items-center gap-2">
                <span class="fs-body font-medium text-text truncate" dir="auto">{{
                  space.name
                }}</span>
              </div>
              <div class="flex items-center gap-2 fs-caption text-text-muted">
                <span>{{ typeName(space) }}</span>
              </div>
              @if (space.description) {
                <p class="fs-caption text-text-secondary m-0 line-clamp-3" dir="auto">
                  {{ space.description }}
                </p>
              }
            </button>

            <div class="flex flex-col justify-center gap-1 pe-1" *peraCan="PERM.crm.spaces.manage">
              <button
                type="button"
                class="p-1 rounded hover:bg-surface-muted disabled:opacity-40"
                [disabled]="first || store.savingSpace()"
                [attr.aria-label]="catalog.t('space.moveUpAria', { name: space.name })"
                (click)="move(space, -1)"
              >
                <pera-icon name="chevron-up" [size]="14" />
              </button>
              <button
                type="button"
                class="p-1 rounded hover:bg-surface-muted disabled:opacity-40"
                [disabled]="last || store.savingSpace()"
                [attr.aria-label]="catalog.t('space.moveDownAria', { name: space.name })"
                (click)="move(space, 1)"
              >
                <pera-icon name="chevron-down" [size]="14" />
              </button>
            </div>
            <div class="flex flex-col justify-center gap-1 pe-1" *peraCan="PERM.crm.spaces.manage">
              <button
                type="button"
                class="p-1 rounded hover:bg-surface-muted"
                [attr.aria-label]="catalog.t('space.renameAria', { name: space.name })"
                (click)="renameSpace(space)"
              >
                <pera-icon name="pencil" [size]="14" />
              </button>
              <button
                type="button"
                class="p-1 rounded hover:bg-surface-muted"
                [attr.aria-label]="
                  space.isActive ? catalog.t('space.deactivate') : catalog.t('space.activate')
                "
                (click)="store.setSpaceActive(space.id, !space.isActive)"
              >
                <pera-icon [name]="space.isActive ? 'eye-off' : 'eye'" [size]="14" />
              </button>
              <button
                type="button"
                class="p-1 rounded hover:bg-surface-muted text-danger disabled:opacity-40"
                [disabled]="store.savingSpace()"
                [attr.aria-label]="catalog.t('space.deleteAria', { name: space.name })"
                (click)="remove(space)"
              >
                <pera-icon name="trash" [size]="14" />
              </button>
            </div>
          </div>
        } @empty {
          <p class="fs-caption text-text-muted m-0 p-2">{{ catalog.t('space.emptySpaces') }}</p>
        }
      </aside>

      <!-- Main column -->
      <div class="min-w-0 flex flex-col gap-4">
        @if (selectedSpace(); as space) {
          <app-crm-space-brief-note [space]="space" [projectId]="projectId()" />
        } @else {
          <p class="fs-caption text-text-muted p-4 m-0">{{ catalog.t('space.selectPrompt') }}</p>
        }
      </div>
    </div>
  `,
})
export class CrmSpacesPageComponent {
  private readonly route = inject(ActivatedRoute);
  protected readonly store = inject(SpacesStore);
  protected readonly catalog = inject(CatalogService);
  private readonly modal = inject(ModalService);
  private readonly confirm = inject(ConfirmService);
  private readonly toast = inject(ToastService);
  /**
   * Lent to every dialog opened from here: `ModalService` builds them off the ROOT injector,
   * so without this the route-provided `SpacesStore` would be invisible and they would have to
   * call the HTTP services directly — which is how they bypassed the store's error layer.
   */
  private readonly injector = inject(Injector);
  protected readonly PERM = PERM;

  readonly projectId = signal('');
  readonly selectedId = signal<string | null>(null);

  readonly selectedSpace = computed<CrmSpace | null>(
    () => this.store.spaces().find((s) => s.id === this.selectedId()) ?? null,
  );

  constructor() {
    const id = this.route.snapshot.paramMap.get('projectId') ?? '';
    this.projectId.set(id);
    this.store.load(id);

    // Keep a valid selection: default to the first space, follow changes.
    effect(() => {
      const spaces = this.store.spaces();
      const current = this.selectedId();
      if (spaces.length === 0) return;
      if (!current || !spaces.some((s) => s.id === current)) {
        this.selectedId.set(spaces[0].id);
      }
    });
  }

  typeName(space: CrmSpace): string {
    return this.catalog.locale() === 'ar'
      ? space.spaceType.nameAr || space.spaceType.nameEn
      : space.spaceType.nameEn;
  }

  /**
   * Rename/retype reuses the add dialog in edit mode — same fields, same validation.
   *
   * The result is deliberately not awaited: the dialog now saves through the store, which
   * refetches on success. Refetching here too would issue every list request twice.
   */
  renameSpace(space: CrmSpace): void {
    const data: AddSpaceDialogData = {
      projectId: this.projectId(),
      spaceTypes: this.store.spaceTypes(),
      existing: space,
    };
    this.modal.open<boolean>(CrmAddSpaceDialogComponent, {
      size: 'md',
      data,
      injector: this.injector,
    });
  }

  /** crmp C-5: one step up/down; a stale order (409 InvalidOrder) reloads and says so. */
  move(space: CrmSpace, step: -1 | 1): void {
    this.store.moveSpace(space.id, step, {
      onError: (err) =>
        this.toast.show({
          tone: err.code === 'crm.spaces.InvalidOrder' ? 'warning' : 'danger',
          message:
            err.code === 'crm.spaces.InvalidOrder'
              ? this.catalog.t('space.orderReloaded')
              : friendly(err),
        }),
    });
  }

  async remove(space: CrmSpace): Promise<void> {
    const ok = await this.confirm.open({
      title: this.catalog.t('space.delete'),
      body: this.catalog.t('space.deleteConfirm'),
      confirmLabel: this.catalog.t('space.delete'),
      cancelLabel: this.catalog.t('space.cancel'),
      tone: 'danger',
    });
    if (!ok) return;
    this.store.deleteSpace(space.id, {
      onDone: () => this.toast.show({ tone: 'success', message: this.catalog.t('space.deleted') }),
      onError: (err) => {
        if (err.code === 'crm.spaces.InUse') {
          void this.offerDeactivate(space);
          return;
        }
        this.toast.show({ tone: 'danger', message: friendly(err) });
      },
    });
  }

  /** 409 `crm.spaces.InUse`: offer the existing deactivate toggle instead. */
  private async offerDeactivate(space: CrmSpace): Promise<void> {
    const ok = await this.confirm.open({
      title: this.catalog.t('space.inUseTitle'),
      body: this.catalog.t('space.inUseOffer', { name: space.name }),
      confirmLabel: this.catalog.t('space.deactivate'),
      cancelLabel: this.catalog.t('space.cancel'),
    });
    if (ok) this.store.setSpaceActive(space.id, false);
  }

  addSpace(): void {
    const data: AddSpaceDialogData = {
      projectId: this.projectId(),
      spaceTypes: this.store.spaceTypes(),
    };
    this.modal.open<boolean>(CrmAddSpaceDialogComponent, {
      size: 'md',
      data,
      injector: this.injector,
    });
  }
}

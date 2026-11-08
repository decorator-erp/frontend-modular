import {
  ChangeDetectionStrategy,
  Component,
  Injector,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { CatalogService } from '@platform/i18n/catalog.service';
import { PERM, PermissionsService } from '@platform/permissions';
import { ModalService, PeraBadgeComponent, PeraButtonComponent } from '@ds';
import type { PortalShareKind } from '../../model/portal.model';
import { PortalSharesStore } from '../../stores/portal-shares.store';
import {
  CrmPortalShareDialogComponent,
  type PortalShareDialogData,
} from './portal-share-dialog.component';

/**
 * crmp P2-B: "Share with client" on another module's item screen (a site survey's photo today). It
 * shows a "Shared with client" badge when the item has an active share, else — with
 * `crm.portal.manage` — a button that opens the share dialog (client title, note, Notify client).
 * The project's shares come from `PortalSharesStore`, read once for all rows of the page. Hosts load
 * it through `crmPortalShareAction` (`@modules/crm`), a lazy loader, and pass four inputs.
 */
@Component({
  selector: 'app-crm-portal-share-action',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PeraBadgeComponent, PeraButtonComponent],
  host: { class: 'inline-flex' },
  template: `
    @if (shared()) {
      <pera-badge tone="success" size="micro" data-testid="portal-shared">{{
        catalog.t('pportal.sharedBadge')
      }}</pera-badge>
    } @else if (canShare()) {
      <pera-button
        variant="ghost"
        size="xs"
        [disabled]="busy()"
        data-testid="portal-share"
        (click)="share()"
        >{{ catalog.t('pportal.shareWithClient')
        }}<span class="sr-only" dir="auto"> {{ itemName() }}</span></pera-button
      >
    }
  `,
})
export class CrmPortalShareActionComponent {
  private readonly store = inject(PortalSharesStore);
  private readonly permissions = inject(PermissionsService);
  private readonly modal = inject(ModalService);
  private readonly injector = inject(Injector);
  protected readonly catalog = inject(CatalogService);

  readonly projectId = input.required<string>();
  readonly kind = input.required<PortalShareKind>();
  readonly itemId = input.required<string>();
  readonly itemName = input('');

  readonly busy = signal(false);

  protected readonly shared = computed(
    () => !!this.store.find(this.projectId(), this.kind(), this.itemId()),
  );
  /** Only once the list is read: an unread list cannot tell "not shared" from "unknown". */
  protected readonly canShare = computed(
    () =>
      this.permissions.can(PERM.crm.portalVisibility.manage) &&
      this.store.state(this.projectId()) === 'ready',
  );

  constructor() {
    effect(() => {
      const projectId = this.projectId();
      untracked(() => this.store.ensure(projectId));
    });
  }

  async share(): Promise<void> {
    if (this.busy() || !this.canShare()) return;
    const data: PortalShareDialogData = {
      mode: 'create',
      projectId: this.projectId(),
      kind: this.kind(),
      itemId: this.itemId(),
      itemName: this.itemName(),
    };
    this.busy.set(true);
    await this.modal
      .open<boolean>(CrmPortalShareDialogComponent, { size: 'md', data, injector: this.injector })
      .afterClosed();
    this.busy.set(false);
  }
}

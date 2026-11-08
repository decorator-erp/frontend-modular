import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import {
  ConfirmService,
  ModalService,
  PeraButtonComponent,
  PeraCardComponent,
  PeraEmptyComponent,
} from '@ds';
import { ToastService } from '@platform/feedback/toast.service';
import { ErrorHandlerService, friendly } from '@platform/http/error-handler.service';
import { CatalogService } from '@platform/i18n/catalog.service';
import type { CatalogKey } from '@platform/i18n/catalog/en';
import { CanDirective, PERM } from '@platform/permissions';
import { CrmClientChildrenService } from '../../data/crm-client-children.service';
import type { CrmClientChild } from '../../model';
import { ClientHubStore } from '../../stores/client-hub.store';
import { ClientChildFormData, CrmClientChildFormComponent } from './client-child-form.component';

/**
 * Sync F4b: the client hub's "Household / children" card — the children on `ClientResponse.children`,
 * with add, edit and remove behind `clients.manage_children` (dms ClientEndpoints.cs:73-111). Every
 * change re-reads the client.
 */
@Component({
  selector: 'app-crm-client-children-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CanDirective, PeraButtonComponent, PeraCardComponent, PeraEmptyComponent],
  template: `
    <pera-card>
      <div class="flex items-center gap-3 p-1">
        <span class="font-semibold fs-body-sm text-text-primary flex-1">{{ t('kids.title') }}</span>
        <pera-button
          variant="secondary"
          size="sm"
          *peraCan="PERM.clients.manageChildren"
          (click)="add()"
          data-add-child
          >{{ t('kids.add') }}</pera-button
        >
      </div>
      @if (children().length) {
        <ul class="flex flex-col gap-2 p-1 m-0 list-none" data-children>
          @for (child of children(); track child.id) {
            <li
              class="flex items-center gap-2 p-2 border border-border rounded-sm"
              [attr.data-child]="child.id"
            >
              <span class="flex-1 min-w-0 fs-body-sm text-text-primary">{{ label(child) }}</span>
              <div class="flex items-center gap-2 shrink-0" *peraCan="PERM.clients.manageChildren">
                <button
                  type="button"
                  class="fs-caption text-text-secondary cursor-pointer underline outline-none focus-visible:outline-2 focus-visible:outline-accent"
                  (click)="edit(child)"
                  data-edit-child
                >
                  {{ t('common.edit') }}
                </button>
                <button
                  type="button"
                  class="fs-caption text-danger cursor-pointer underline outline-none focus-visible:outline-2 focus-visible:outline-accent"
                  (click)="remove(child)"
                  data-remove-child
                >
                  {{ t('common.delete') }}
                </button>
              </div>
            </li>
          }
        </ul>
      } @else {
        <pera-empty [title]="t('kids.empty')" />
      }
    </pera-card>
  `,
})
export class CrmClientChildrenCardComponent {
  private readonly modal = inject(ModalService);
  private readonly confirm = inject(ConfirmService);
  private readonly api = inject(CrmClientChildrenService);
  private readonly errors = inject(ErrorHandlerService);
  private readonly toast = inject(ToastService);
  private readonly catalog = inject(CatalogService);
  protected readonly store = inject(ClientHubStore);
  protected readonly PERM = PERM;

  protected children(): CrmClientChild[] {
    return this.store.client()?.children ?? [];
  }

  t(key: string, params?: Record<string, string | number>): string {
    return this.catalog.t(key as CatalogKey, params);
  }

  label(child: CrmClientChild): string {
    const gender =
      child.gender === 'M'
        ? this.t('kids.male')
        : child.gender === 'F'
          ? this.t('kids.female')
          : '';
    const age = this.t('kids.ageN', { n: child.age });
    return gender ? this.t('kids.row', { gender, age }) : age;
  }

  async add(): Promise<void> {
    const client = this.store.client();
    if (client) await this.open({ clientId: client.id });
  }

  async edit(child: CrmClientChild): Promise<void> {
    const client = this.store.client();
    if (client) await this.open({ clientId: client.id, child });
  }

  private async open(data: ClientChildFormData): Promise<void> {
    const ok = await this.modal
      .open<boolean>(CrmClientChildFormComponent, { size: 'sm', data })
      .afterClosed();
    if (!ok) return;
    this.toast.show({ tone: 'success', message: this.t('kids.saved') });
    this.store.reloadClient();
  }

  async remove(child: CrmClientChild): Promise<void> {
    const client = this.store.client();
    if (!client) return;
    const ok = await this.confirm.open({
      title: this.t('kids.removeTitle'),
      body: this.t('kids.removeBody'),
      confirmLabel: this.t('common.delete'),
      cancelLabel: this.t('common.cancel'),
      tone: 'danger',
    });
    if (!ok) return;
    this.api.removeChild(client.id, child.id).subscribe({
      next: () => {
        this.toast.show({ tone: 'success', message: this.t('kids.removed') });
        this.store.reloadClient();
      },
      error: (err: HttpErrorResponse) =>
        this.toast.show({ tone: 'danger', message: friendly(this.errors.parse(err)) }),
    });
  }
}

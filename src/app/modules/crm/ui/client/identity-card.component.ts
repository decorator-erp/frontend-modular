import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { CatalogService } from '@platform/i18n/catalog.service';
import type { ClientIdentity } from '../../model';
import { PeraCardComponent } from '@ds';

/**
 * The client identity card (T109, FR-028) — client data as a **versioned ledger**:
 * this renders the CURRENT record only (`ClientIdentity` carries no version/history
 * fields on the wire — see Dependency 13 in `@core/models/crm`). Editing is out of
 * this run's scope (no `crm.portal` write exists for a client's own identity); this
 * is display-only.
 *
 * Deliberately excludes `notes` — an office-authored field that must never reach a
 * client-facing screen (FR-016); `ClientIdentity` itself carries no such field.
 */
@Component({
  selector: 'app-crm-identity-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PeraCardComponent],
  host: { class: 'block' },
  template: `
    <pera-card>
      <div class="flex flex-col gap-3 p-1">
        <span class="font-semibold fs-body-sm text-text-primary">{{
          catalog.t('client.identityData')
        }}</span>
        <dl class="flex flex-col gap-2 fs-body-sm m-0">
          <div class="flex items-center justify-between gap-3">
            <dt class="text-text-secondary">{{ catalog.t('client.lbl') }}</dt>
            <dd class="text-text-primary font-medium m-0">
              {{ identity().name || identity().firstName + ' ' + identity().lastName }}
            </dd>
          </div>
          @if (identity().email) {
            <div class="flex items-center justify-between gap-3">
              <dt class="text-text-secondary">{{ catalog.t('client.email') }}</dt>
              <dd class="text-text-primary m-0" dir="ltr">{{ identity().email }}</dd>
            </div>
          }
          @if (identity().phoneNumber) {
            <div class="flex items-center justify-between gap-3">
              <dt class="text-text-secondary">{{ catalog.t('brief.fPhone') }}</dt>
              <dd class="text-text-primary m-0" dir="ltr">{{ identity().phoneNumber }}</dd>
            </div>
          }
          @if (identity().address) {
            <div class="flex items-center justify-between gap-3">
              <dt class="text-text-secondary">{{ catalog.t('brief.fAddress') }}</dt>
              <dd class="text-text-primary m-0 text-end">{{ identity().address }}</dd>
            </div>
          }
        </dl>
      </div>
    </pera-card>
  `,
})
export class CrmIdentityCardComponent {
  protected readonly catalog = inject(CatalogService);
  readonly identity = input.required<ClientIdentity>();
}

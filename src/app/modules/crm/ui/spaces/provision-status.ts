import type { CatalogKey } from '@platform/i18n/catalog/en';
import { CrmProvisionStatus } from '../../model/crm-enums';
import type { StatusBadgeTone } from '@ds';

/** The i18n chrome key for a provisioning status. */
export function provisionStatusKey(status: CrmProvisionStatus): CatalogKey {
  switch (status) {
    case CrmProvisionStatus.ClientHas:
      return 'space.statusClientHas';
    case CrmProvisionStatus.Reuse:
      return 'space.statusReuse';
    case CrmProvisionStatus.NotApplicable:
      return 'space.statusNotApplicable';
    case CrmProvisionStatus.ToBuy:
    default:
      return 'space.statusToBuy';
  }
}

/** The status-badge tone for a provisioning status. */
export function provisionStatusTone(status: CrmProvisionStatus): StatusBadgeTone {
  switch (status) {
    case CrmProvisionStatus.ClientHas:
      return 'success';
    case CrmProvisionStatus.Reuse:
      return 'info';
    case CrmProvisionStatus.NotApplicable:
      return 'neutral';
    case CrmProvisionStatus.ToBuy:
    default:
      return 'warning';
  }
}

/** The interactive board badge cycles ToBuy → ClientHas → Reuse → N/A → ToBuy. */
export function nextProvisionStatus(status: CrmProvisionStatus): CrmProvisionStatus {
  switch (status) {
    case CrmProvisionStatus.ToBuy:
      return CrmProvisionStatus.ClientHas;
    case CrmProvisionStatus.ClientHas:
      return CrmProvisionStatus.Reuse;
    case CrmProvisionStatus.Reuse:
      return CrmProvisionStatus.NotApplicable;
    case CrmProvisionStatus.NotApplicable:
    default:
      return CrmProvisionStatus.ToBuy;
  }
}

/** All statuses in cycle order — for tabs / KPI tiles. */
export const PROVISION_STATUSES: readonly CrmProvisionStatus[] = [
  CrmProvisionStatus.ToBuy,
  CrmProvisionStatus.ClientHas,
  CrmProvisionStatus.Reuse,
  CrmProvisionStatus.NotApplicable,
];

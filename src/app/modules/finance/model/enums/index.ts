/**
 * Finance enum barrel — re-exports the string-enum unions from
 * `api-docs/11-finance.md`. Each per-file module also exports `label()`,
 * `tone()`, and `options()` helpers; import the namespace to access them
 * without name collisions:
 *
 *   import * as LedgerDir from '@shared/enums/finance/ledger-direction.enum';
 *   LedgerDir.label('In');
 */

export type { LedgerDirection } from './ledger-direction.enum';
export { LedgerDirectionValues } from './ledger-direction.enum';

export type { LedgerEntryType } from './ledger-entry-type.enum';
export { LedgerEntryTypeValues } from './ledger-entry-type.enum';

export type { PaymentMethod } from './payment-method.enum';
export { PaymentMethodValues } from './payment-method.enum';

export type { InvoiceType } from './invoice-type.enum';
export { InvoiceTypeValues } from './invoice-type.enum';

export type { InvoiceStatus } from './invoice-status.enum';
export { InvoiceStatusValues } from './invoice-status.enum';

export type { VariationKind } from './variation-kind.enum';
export { VariationKindValues } from './variation-kind.enum';

export type { VariationStatus } from './variation-status.enum';
export {
  VariationStatusValues,
  VariationStatusTransitions,
  canTransition as canTransitionVariation,
} from './variation-status.enum';

export type { TaskBudgetStatus } from './task-budget-status.enum';
export { TaskBudgetStatusValues } from './task-budget-status.enum';

export type { BoqSnapshotType, BoqSnapshotLineKind } from './boq-snapshot-type.enum';
export { BoqSnapshotTypeValues } from './boq-snapshot-type.enum';

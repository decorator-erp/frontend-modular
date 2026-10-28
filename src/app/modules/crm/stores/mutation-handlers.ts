import type { CatalogKey } from '@platform/i18n/catalog/en';
import type { ParsedApiError } from '@platform/types';

/**
 * Optional completion hooks for a store mutation.
 *
 * Store methods stay `void` + `.subscribe({ next, error })` (the repo idiom — `rxMethod` is
 * used nowhere and is not introduced). These hooks let a component sequence UI on the real
 * outcome instead of firing optimistically after dispatch.
 *
 * `onError` receives the PARSED server error so the caller can say *why*: a 409 on a node
 * save is `crm.catalog.CodeTaken` vs `CycleDetected`, which `error-catalog.ts` already
 * distinguishes. The generic `fallback` key is only for a failure carrying no domain code.
 */
export interface MutationHandlers {
  onDone?: () => void;
  onError?: (error: ParsedApiError, fallback: CatalogKey) => void;
}

import type { BadgeTone } from '@platform/types/presentation';
import type { Locale } from '@platform/i18n';

/** Movement direction on the ledger. Serialised as string per `api-docs/11-finance.md`. */
export type LedgerDirection = 'In' | 'Out';

export const LedgerDirectionValues: LedgerDirection[] = ['In', 'Out'];

const LABELS_EN: Record<LedgerDirection, string> = {
  In: 'In',
  Out: 'Out',
};
const LABELS_AR: Record<LedgerDirection, string> = {
  In: 'وارد',
  Out: 'صادر',
};

export function label(value: LedgerDirection, locale: Locale = 'en'): string {
  return (locale === 'ar' ? LABELS_AR : LABELS_EN)[value];
}

export function tone(value: LedgerDirection): BadgeTone {
  return value === 'In' ? 'success' : 'warning';
}

export function options(locale: Locale = 'en'): { value: LedgerDirection; label: string }[] {
  return LedgerDirectionValues.map((v) => ({ value: v, label: label(v, locale) }));
}

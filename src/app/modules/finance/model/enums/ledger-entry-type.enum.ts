import type { BadgeTone } from '@platform/types/presentation';
import type { Locale } from '@platform/i18n';

/** What the ledger entry represents. Per `api-docs/11-finance.md` Section 3. */
export type LedgerEntryType = 'Commitment' | 'ActualCost' | 'ClientPayment';

export const LedgerEntryTypeValues: LedgerEntryType[] = [
  'Commitment',
  'ActualCost',
  'ClientPayment',
];

const LABELS_EN: Record<LedgerEntryType, string> = {
  Commitment: 'Commitment',
  ActualCost: 'Actual cost',
  ClientPayment: 'Client payment',
};
const LABELS_AR: Record<LedgerEntryType, string> = {
  Commitment: 'التزام',
  ActualCost: 'تكلفة فعلية',
  ClientPayment: 'دفعة عميل',
};

export function label(value: LedgerEntryType, locale: Locale = 'en'): string {
  return (locale === 'ar' ? LABELS_AR : LABELS_EN)[value];
}

export function tone(value: LedgerEntryType): BadgeTone {
  switch (value) {
    case 'Commitment':
      return 'info';
    case 'ActualCost':
      return 'warning';
    case 'ClientPayment':
      return 'success';
  }
}

export function options(locale: Locale = 'en'): { value: LedgerEntryType; label: string }[] {
  return LedgerEntryTypeValues.map((v) => ({ value: v, label: label(v, locale) }));
}

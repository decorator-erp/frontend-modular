import type { BadgeTone } from '@platform/types/presentation';
import type { Locale } from '@platform/i18n';

/** How a cash movement was executed. Per `api-docs/11-finance.md` Section 3. */
export type PaymentMethod = 'Cash' | 'BankTransfer' | 'Cheque' | 'Card' | 'Other';

export const PaymentMethodValues: PaymentMethod[] = [
  'Cash',
  'BankTransfer',
  'Cheque',
  'Card',
  'Other',
];

const LABELS_EN: Record<PaymentMethod, string> = {
  Cash: 'Cash',
  BankTransfer: 'Bank transfer',
  Cheque: 'Cheque',
  Card: 'Card',
  Other: 'Other',
};
const LABELS_AR: Record<PaymentMethod, string> = {
  Cash: 'نقدًا',
  BankTransfer: 'تحويل بنكي',
  Cheque: 'شيك',
  Card: 'بطاقة',
  Other: 'أخرى',
};

export function label(value: PaymentMethod, locale: Locale = 'en'): string {
  return (locale === 'ar' ? LABELS_AR : LABELS_EN)[value];
}

export function tone(_value: PaymentMethod): BadgeTone {
  return 'neutral';
}

export function options(locale: Locale = 'en'): { value: PaymentMethod; label: string }[] {
  return PaymentMethodValues.map((v) => ({ value: v, label: label(v, locale) }));
}

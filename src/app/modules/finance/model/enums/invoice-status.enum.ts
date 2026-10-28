import type { BadgeTone } from '@platform/types/presentation';
import type { Locale } from '@platform/i18n';

/** Lifecycle status of an invoice. Per `api-docs/11-finance.md` Section 4. */
export type InvoiceStatus = 'Open' | 'Paid' | 'Cancelled';

export const InvoiceStatusValues: InvoiceStatus[] = ['Open', 'Paid', 'Cancelled'];

const LABELS_EN: Record<InvoiceStatus, string> = {
  Open: 'Open',
  Paid: 'Paid',
  Cancelled: 'Cancelled',
};
const LABELS_AR: Record<InvoiceStatus, string> = {
  Open: 'مفتوحة',
  Paid: 'مدفوعة',
  Cancelled: 'ملغاة',
};

export function label(value: InvoiceStatus, locale: Locale = 'en'): string {
  return (locale === 'ar' ? LABELS_AR : LABELS_EN)[value];
}

export function tone(value: InvoiceStatus): BadgeTone {
  switch (value) {
    case 'Open':
      return 'info';
    case 'Paid':
      return 'success';
    case 'Cancelled':
      return 'danger';
  }
}

export function options(locale: Locale = 'en'): { value: InvoiceStatus; label: string }[] {
  return InvoiceStatusValues.map((v) => ({ value: v, label: label(v, locale) }));
}

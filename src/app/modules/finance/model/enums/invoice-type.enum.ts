import type { BadgeTone } from '@platform/types/presentation';
import type { Locale } from '@platform/i18n';

/** Direction of the invoice. Per `api-docs/11-finance.md` Section 4. */
export type InvoiceType = 'ClientInvoice' | 'VendorInvoice';

export const InvoiceTypeValues: InvoiceType[] = ['ClientInvoice', 'VendorInvoice'];

const LABELS_EN: Record<InvoiceType, string> = {
  ClientInvoice: 'Client invoice',
  VendorInvoice: 'Vendor invoice',
};
const LABELS_AR: Record<InvoiceType, string> = {
  ClientInvoice: 'فاتورة عميل',
  VendorInvoice: 'فاتورة مورّد',
};

export function label(value: InvoiceType, locale: Locale = 'en'): string {
  return (locale === 'ar' ? LABELS_AR : LABELS_EN)[value];
}

export function tone(value: InvoiceType): BadgeTone {
  return value === 'ClientInvoice' ? 'success' : 'info';
}

export function options(locale: Locale = 'en'): { value: InvoiceType; label: string }[] {
  return InvoiceTypeValues.map((v) => ({ value: v, label: label(v, locale) }));
}

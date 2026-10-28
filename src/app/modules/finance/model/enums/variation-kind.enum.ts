import type { BadgeTone } from '@platform/types/presentation';
import type { Locale } from '@platform/i18n';

/** Variation kind. Per `api-docs/11-finance.md` Section 5. */
export type VariationKind = 'ClientDifference' | 'InternalChange';

export const VariationKindValues: VariationKind[] = ['ClientDifference', 'InternalChange'];

const LABELS_EN: Record<VariationKind, string> = {
  ClientDifference: 'Client difference',
  InternalChange: 'Internal change',
};
const LABELS_AR: Record<VariationKind, string> = {
  ClientDifference: 'فرق عميل',
  InternalChange: 'تغيير داخلي',
};

export function label(value: VariationKind, locale: Locale = 'en'): string {
  return (locale === 'ar' ? LABELS_AR : LABELS_EN)[value];
}

export function tone(value: VariationKind): BadgeTone {
  return value === 'ClientDifference' ? 'accent' : 'info';
}

export function options(locale: Locale = 'en'): { value: VariationKind; label: string }[] {
  return VariationKindValues.map((v) => ({ value: v, label: label(v, locale) }));
}

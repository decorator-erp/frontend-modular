import type { BadgeTone } from '@platform/types/presentation';
import type { Locale } from '@platform/i18n';

/** Variation lifecycle status. Per `api-docs/11-finance.md` Section 5. */
export type VariationStatus =
  'Draft' | 'Submitted' | 'Approved' | 'Rejected' | 'Cancelled' | 'Applied';

export const VariationStatusValues: VariationStatus[] = [
  'Draft',
  'Submitted',
  'Approved',
  'Rejected',
  'Cancelled',
  'Applied',
];

const LABELS_EN: Record<VariationStatus, string> = {
  Draft: 'Draft',
  Submitted: 'Submitted',
  Approved: 'Approved',
  Rejected: 'Rejected',
  Cancelled: 'Cancelled',
  Applied: 'Applied',
};
const LABELS_AR: Record<VariationStatus, string> = {
  Draft: 'مسودة',
  Submitted: 'مُرسلة',
  Approved: 'معتمدة',
  Rejected: 'مرفوضة',
  Cancelled: 'ملغاة',
  Applied: 'مُطبَّقة',
};

export function label(value: VariationStatus, locale: Locale = 'en'): string {
  return (locale === 'ar' ? LABELS_AR : LABELS_EN)[value];
}

export function tone(value: VariationStatus): BadgeTone {
  switch (value) {
    case 'Draft':
      return 'neutral';
    case 'Submitted':
      return 'warning';
    case 'Approved':
      return 'info';
    case 'Rejected':
      return 'danger';
    case 'Cancelled':
      return 'neutral';
    case 'Applied':
      return 'success';
  }
}

/**
 * Allowed forward transitions for the variation lifecycle, per Section 5 of
 * `api-docs/11-finance.md` and the "typical frontend flow #4". Terminal states
 * have an empty array. `Approved -> Applied` is the apply step; `Sign` is
 * modelled as part of the action set on `Approved` for client-difference
 * variations and does not change the status (the signedDocumentPath field is
 * what guards `Apply` on the client side).
 */
export const VariationStatusTransitions: Record<VariationStatus, VariationStatus[]> = {
  Draft: ['Submitted', 'Cancelled'],
  Submitted: ['Approved', 'Rejected', 'Cancelled'],
  Approved: ['Applied', 'Cancelled'],
  Rejected: [],
  Cancelled: [],
  Applied: [],
};

export function canTransition(from: VariationStatus, to: VariationStatus): boolean {
  return VariationStatusTransitions[from].includes(to);
}

export function options(locale: Locale = 'en'): { value: VariationStatus; label: string }[] {
  return VariationStatusValues.map((v) => ({ value: v, label: label(v, locale) }));
}

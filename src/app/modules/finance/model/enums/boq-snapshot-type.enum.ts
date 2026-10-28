import type { BadgeTone } from '@platform/types/presentation';
import type { Locale } from '@platform/i18n';

/** Kind of BOQ snapshot. Per `api-docs/11-finance.md` Section 6. */
export type BoqSnapshotType = 'StageClose' | 'ProjectFinal' | 'Manual';

export const BoqSnapshotTypeValues: BoqSnapshotType[] = ['StageClose', 'ProjectFinal', 'Manual'];

const LABELS_EN: Record<BoqSnapshotType, string> = {
  StageClose: 'Stage close',
  ProjectFinal: 'Project final',
  Manual: 'Manual',
};
const LABELS_AR: Record<BoqSnapshotType, string> = {
  StageClose: 'إغلاق مرحلة',
  ProjectFinal: 'إقفال نهائي',
  Manual: 'يدوي',
};

export function label(value: BoqSnapshotType, locale: Locale = 'en'): string {
  return (locale === 'ar' ? LABELS_AR : LABELS_EN)[value];
}

export function tone(value: BoqSnapshotType): BadgeTone {
  switch (value) {
    case 'StageClose':
      return 'info';
    case 'ProjectFinal':
      return 'success';
    case 'Manual':
      return 'neutral';
  }
}

/** BOQ-line kind is inferred server-side per Section 6 — same enum shape. */
export type BoqSnapshotLineKind = 'BudgetItem' | 'Purchase' | 'Difference';

const LINE_LABELS_EN: Record<BoqSnapshotLineKind, string> = {
  BudgetItem: 'Budget item',
  Purchase: 'Purchase',
  Difference: 'Difference',
};
const LINE_LABELS_AR: Record<BoqSnapshotLineKind, string> = {
  BudgetItem: 'بند ميزانية',
  Purchase: 'مشتريات',
  Difference: 'فرق',
};

export function lineKindLabel(value: BoqSnapshotLineKind, locale: Locale = 'en'): string {
  return (locale === 'ar' ? LINE_LABELS_AR : LINE_LABELS_EN)[value];
}

export function lineKindTone(value: BoqSnapshotLineKind): BadgeTone {
  switch (value) {
    case 'BudgetItem':
      return 'neutral';
    case 'Purchase':
      return 'info';
    case 'Difference':
      return 'warning';
  }
}

export function options(locale: Locale = 'en'): { value: BoqSnapshotType; label: string }[] {
  return BoqSnapshotTypeValues.map((v) => ({ value: v, label: label(v, locale) }));
}

import type { BadgeTone } from '@platform/types/presentation';
import type { Locale } from '@platform/i18n';

/**
 * Whether a task is over its allocated budget. Per `api-docs/11-finance.md`,
 * extended with `AtRisk` for the financial-query API (committed + actual is
 * trending past the effective cap, but actual has not yet exceeded it).
 */
export type TaskBudgetStatus = 'WithinBudget' | 'AtRisk' | 'OverBudget';

export const TaskBudgetStatusValues: TaskBudgetStatus[] = ['WithinBudget', 'AtRisk', 'OverBudget'];

const LABELS_EN: Record<TaskBudgetStatus, string> = {
  WithinBudget: 'Within budget',
  AtRisk: 'At risk',
  OverBudget: 'Over budget',
};
const LABELS_AR: Record<TaskBudgetStatus, string> = {
  WithinBudget: 'ضمن الميزانية',
  AtRisk: 'معرّض للخطر',
  OverBudget: 'تجاوز الميزانية',
};

export function label(value: TaskBudgetStatus, locale: Locale = 'en'): string {
  return (locale === 'ar' ? LABELS_AR : LABELS_EN)[value];
}

export function tone(value: TaskBudgetStatus): BadgeTone {
  switch (value) {
    case 'OverBudget':
      return 'danger';
    case 'AtRisk':
      return 'warning';
    default:
      return 'success';
  }
}

export function options(locale: Locale = 'en'): { value: TaskBudgetStatus; label: string }[] {
  return TaskBudgetStatusValues.map((v) => ({ value: v, label: label(v, locale) }));
}

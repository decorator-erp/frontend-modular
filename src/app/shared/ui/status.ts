import { BadgeTone } from '@platform/types/presentation';

/** Project status → badge tone (Draft→neutral, InProgress→info, OnHold→warning, Completed→success, Cancelled→danger). */
export function projectStatusTone(status: string): BadgeTone {
  switch (status) {
    case 'InProgress':
      return 'info';
    case 'OnHold':
      return 'warning';
    case 'Completed':
      return 'success';
    case 'Cancelled':
      return 'danger';
    default:
      return 'neutral';
  }
}

export function projectStatusLabel(status: string): string {
  switch (status) {
    case 'InProgress':
      return 'In progress';
    case 'OnHold':
      return 'On hold';
    default:
      return status || '—';
  }
}

/** Stage status → badge tone (Locked/Skipped→neutral, Active→info, Completed→success, Rejected→danger). */
export function stageStatusTone(status: string): BadgeTone {
  switch (status) {
    case 'Active':
      return 'info';
    case 'Completed':
      return 'success';
    case 'Rejected':
      return 'danger';
    default:
      return 'neutral';
  }
}

/** Task status → badge tone. */
export function taskStatusTone(status: string): BadgeTone {
  switch (status) {
    case 'Open':
      return 'accent';
    case 'InProgress':
      return 'info';
    case 'Completed':
      return 'success';
    case 'PendingApproval':
      return 'warning';
    case 'Rejected':
    case 'Cancelled':
      return 'danger';
    default:
      return 'neutral';
  }
}

export function taskStatusLabel(status: string): string {
  switch (status) {
    case 'InProgress':
      return 'In progress';
    case 'PendingApproval':
      return 'Pending approval';
    case 'Open':
      return 'To do';
    case 'Locked':
      return 'Locked'; // first-class gating state — kept distinct, not an accidental passthrough
    default:
      return status || '—';
  }
}

/** Priority → badge tone (low=neutral, medium=info, high=warning, urgent=danger). */
export function priorityTone(priority: string): BadgeTone {
  switch (priority) {
    case 'Medium':
      return 'info';
    case 'High':
      return 'warning';
    case 'Urgent':
      return 'danger';
    default:
      return 'neutral';
  }
}

/** "MMM dd" via Intl, locale-aware. */
export function formatShortDate(iso: string | null | undefined, locale = 'en'): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat(locale, { month: 'short', day: '2-digit' }).format(d);
}

export function formatLongDate(iso: string | null | undefined, locale = 'en'): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(d);
}

/** Relative due-date phrasing: "overdue", "today", "tomorrow", "in N days". */
export function relativeDue(iso: string | null | undefined): string {
  if (!iso) return '—';
  const due = new Date(iso);
  if (isNaN(due.getTime())) return '—';
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const days = Math.floor((due.getTime() - startOfToday.getTime()) / 86_400_000);
  if (days < 0) return 'overdue';
  if (days === 0) return 'today';
  if (days === 1) return 'tomorrow';
  return `in ${days} days`;
}

/** Days elapsed since an ISO timestamp (≥ 0). */
export function daysSince(iso: string | null | undefined): number {
  if (!iso) return 0;
  const t = new Date(iso).getTime();
  if (isNaN(t)) return 0;
  return Math.max(0, Math.floor((Date.now() - t) / 86_400_000));
}

/**
 * Locale currency (EGP default), no decimals.
 *
 * @deprecated Use `MoneyService` from `@shared/ui/money.service` instead — it
 * preserves the decimal(19,4) precision of the Financial API by keeping values
 * as strings until the Intl boundary. Remaining callers (projects-list,
 * project-detail header) operate on the legacy `Project.estimatedBudget`
 * number field; migrate them as the Finance dashboard rolls out.
 */
export function formatMoney(
  amount: number | null | undefined,
  locale = 'en',
  currency = 'EGP',
): string {
  if (amount === null || amount === undefined || isNaN(amount)) return '—';
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
}

/** "Joined Jan 2024 · 1y 5m" style tenure string. */
export function tenure(hireDateIso: string | null | undefined, locale = 'en'): string {
  if (!hireDateIso) return '';
  const start = new Date(hireDateIso);
  if (isNaN(start.getTime())) return '';
  const joined = new Intl.DateTimeFormat(locale, { month: 'short', year: 'numeric' }).format(start);
  let months = (Date.now() - start.getTime()) / (86_400_000 * 30.44);
  months = Math.max(0, Math.floor(months));
  const y = Math.floor(months / 12);
  const m = months % 12;
  const span = y > 0 ? `${y}y ${m}m` : `${m}m`;
  return `Joined ${joined} · ${span}`;
}

import { toUtcDate } from './utc-date';

/**
 * crmp P1-B: a grant's window. Presets run from the start (now, or the chosen start); a custom
 * date-time is the browser's local `datetime-local` value, sent as UTC `Z` (`toUtcDate`).
 */
export type DurationPreset = 'day' | 'week' | 'month' | 'custom' | 'none';
export type StartChoice = 'now' | 'custom';

/** The end a preset gives from `base`; null for "No end" and "custom" (the caller reads the field). */
export function presetEnd(preset: DurationPreset, base: Date): Date | null {
  const end = new Date(base.getTime());
  switch (preset) {
    case 'day':
      end.setDate(end.getDate() + 1);
      return end;
    case 'week':
      end.setDate(end.getDate() + 7);
      return end;
    case 'month':
      end.setMonth(end.getMonth() + 1);
      return end;
    default:
      return null;
  }
}

/** `yyyy-MM-ddTHH:mm` (browser local) → UTC `Z`; empty or invalid → null. */
export function localInputToUtc(value: string | null | undefined): string | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value)) return null;
  return toUtcDate(value);
}

/** A UTC instant → the `datetime-local` value in the browser's zone (`yyyy-MM-ddTHH:mm`). */
export function utcToLocalInput(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

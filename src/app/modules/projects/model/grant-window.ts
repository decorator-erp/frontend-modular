import { cairoLocalToUtcIso, utcIsoToCairoLocalInput } from '@platform/i18n/intl-locale';

/**
 * crmp P1-B: a grant's window. Presets run from the start (now, or the chosen start); a custom
 * date-time is a `datetime-local` value read as Cairo wall-clock time (the app's rule, FR-034) and
 * sent as UTC `Z`.
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

/** `yyyy-MM-ddTHH:mm` (Cairo wall clock) → UTC `Z`; empty or invalid → null. */
export function localInputToUtc(value: string | null | undefined): string | null {
  const m = value?.match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/);
  if (!m) return null;
  const iso = cairoLocalToUtcIso(m[0]);
  return Number.isNaN(Date.parse(iso)) ? null : iso;
}

/** A UTC instant → the `datetime-local` value in Cairo wall-clock time (`yyyy-MM-ddTHH:mm`). */
export function utcToLocalInput(iso: string | null | undefined): string {
  if (!iso || Number.isNaN(Date.parse(iso))) return '';
  return utcIsoToCairoLocalInput(iso);
}

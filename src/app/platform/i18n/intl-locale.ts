import type { Locale } from './locale.service';

/**
 * The one `Locale` → BCP-47 tag helper, for direct `Intl.*` formatting.
 *
 * This ternary is today duplicated privately in six places (`pera-currency.component.ts`,
 * `money.service.ts`, four finance tables), hardcoded to `'en-US'` in six more, and
 * passed as a bare `'ar'` / `'en'` in the rest. **CRM uses this helper exclusively.**
 * Retro-fitting the other sites is out of scope (FR-037d) — the helper is placed so
 * that they *can* adopt it.
 *
 * ⚠️ See `contracts/string-catalog.md` §6 (the ar-EG policy, T011): CRM formats through
 * `Intl.*` with this tag and does **not** use locale-aware Angular pipes.
 */
export function intlLocale(locale: Locale): string {
  return locale === 'ar' ? 'ar-EG' : 'en-US';
}

/** Times are stored UTC and rendered in the office's timezone — never hand-written. */
export const APP_TIME_ZONE = 'Africa/Cairo';

/** `20 Jul 2026, 18:00` (or its Arabic-numeral/month equivalent) — the one CRM datetime formatter. */
export function formatCairoDateTime(isoUtc: string, locale: Locale): string {
  return new Intl.DateTimeFormat(intlLocale(locale), {
    timeZone: APP_TIME_ZONE,
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(isoUtc));
}

/** `20 Jul 2026` — date only, e.g. a close-date summary line. */
export function formatCairoDate(isoUtc: string, locale: Locale): string {
  return new Intl.DateTimeFormat(intlLocale(locale), {
    timeZone: APP_TIME_ZONE,
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(isoUtc));
}

/** Reads `date` (an instant) as wall-clock digits in `timeZone`, tagged back on as UTC. */
function wallClockAsUtcMs(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(date);
  const get = (type: string): string => parts.find((p) => p.type === type)?.value ?? '00';
  // Some engines render midnight as "24" under hour12:false — normalize to "00".
  const hour = get('hour') === '24' ? '00' : get('hour');
  return Date.parse(
    `${get('year')}-${get('month')}-${get('day')}T${hour}:${get('minute')}:${get('second')}Z`,
  );
}

/**
 * Converts a `<input type="datetime-local">` value (`YYYY-MM-DDTHH:mm`, timezone-naive —
 * the browser attaches no offset) into a UTC ISO instant, treating the entered digits as
 * **Cairo wall-clock time** (never the visitor's own machine timezone — FR-034).
 *
 * Works by measuring, at a baseline guess, how far Cairo's clock reads from UTC at that
 * instant (DST-safe via the IANA database `Intl` carries), then correcting by that offset.
 */
export function cairoLocalToUtcIso(localDateTime: string): string {
  const naiveMs = Date.parse(`${localDateTime}:00Z`); // entered digits, provisionally tagged UTC
  const cairoReadingMs = wallClockAsUtcMs(new Date(naiveMs), APP_TIME_ZONE);
  const offsetMs = cairoReadingMs - naiveMs; // how far ahead Cairo's wall clock is, right now
  return new Date(naiveMs - offsetMs).toISOString();
}

/** The inverse — a UTC ISO instant to a `datetime-local` value showing Cairo wall-clock time. */
export function utcIsoToCairoLocalInput(isoUtc: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: APP_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date(isoUtc));
  const get = (type: string): string => parts.find((p) => p.type === type)?.value ?? '00';
  const hour = get('hour') === '24' ? '00' : get('hour');
  return `${get('year')}-${get('month')}-${get('day')}T${hour}:${get('minute')}`;
}

/**
 * crm-prod L-fe-2: typed numbers in ASCII. Arabic-Indic (٠-٩, U+0660-0669) and Extended
 * Arabic-Indic (۰-۹, U+06F0-06F9) digits become 0-9, the Arabic decimal separator (٫) a `.` and
 * the Arabic thousands separator (٬) a `,`, so an Arabic keyboard's money input parses.
 */
export function toAsciiDigits(text: string): string {
  return text
    .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[\u06f0-\u06f9]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/\u066b/g, '.')
    .replace(/\u066c/g, ',');
}

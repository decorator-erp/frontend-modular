import { cairoLocalToUtcIso } from '@platform/i18n/intl-locale';
import { MeetingSlotStatus } from '../../model/crm-enums';
import type { CrmMeeting, FreeSlot } from '../../model';
import { isSlotHeld } from '../../stores/meetings.store';

/** `sched.sub` — Sun–Thu 10:00–18:00, 60-min slots. Static office-hours knowledge, not on the wire. */
export const OFFICE_START_HOUR = 10;
export const OFFICE_END_HOUR = 18;
/** Cairo-local weekday indices that are office days — Sunday(0)…Thursday(4). */
const OFFICE_WEEKDAYS = new Set([0, 1, 2, 3, 4]);

export type ScheduleSlotState = 'free' | 'held' | 'booked' | 'unavailable';

export interface ScheduleCell {
  startsAtUtc: string;
  endsAtUtc: string;
  state: ScheduleSlotState;
}

export interface ScheduleDay {
  /** `YYYY-MM-DD` in Cairo-local terms — a stable key for the day pill. */
  dayKey: string;
  cells: ScheduleCell[];
}

const CAIRO_WEEKDAY_FORMATTER = new Intl.DateTimeFormat('en-US', {
  timeZone: 'Africa/Cairo',
  weekday: 'short',
});
const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

function cairoDateKey(date: Date): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Africa/Cairo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '00';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

function overlaps(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return aStart < bEnd && bStart < aEnd;
}

/**
 * Builds the office-hours skeleton (Sun–Thu, 10:00–18:00, 60-min cells) for the next
 * `rangeDays` Cairo-local calendar days starting from `fromUtc`, classifying each cell
 * against the server's free windows and the project's existing meeting slots.
 *
 * The server computes availability (`freeSlots`) — this NEVER derives free-ness on its
 * own; it only decides which office-hour cell a returned window falls into, and overlays
 * booked/held state from `meetings` so the whole picture renders in one grid.
 */
export function buildScheduleDays(
  fromUtc: string,
  rangeDays: number,
  freeSlots: readonly FreeSlot[],
  meetings: readonly CrmMeeting[],
  nowMs: number = Date.now(),
): ScheduleDay[] {
  const booked = meetings
    .flatMap((m) => m.slots)
    .filter((s) => s.status === MeetingSlotStatus.Accepted);
  const held = meetings.flatMap((m) => m.slots).filter((s) => isSlotHeld(s, nowMs));

  const days: ScheduleDay[] = [];
  const start = new Date(fromUtc);

  for (let d = 0; d < rangeDays; d++) {
    const dayDate = new Date(start.getTime() + d * 86_400_000);
    const weekday = WEEKDAY_INDEX[CAIRO_WEEKDAY_FORMATTER.format(dayDate)];
    if (!OFFICE_WEEKDAYS.has(weekday)) continue;

    const dayKey = cairoDateKey(dayDate);
    const cells: ScheduleCell[] = [];
    for (let hour = OFFICE_START_HOUR; hour < OFFICE_END_HOUR; hour++) {
      const localStart = `${dayKey}T${String(hour).padStart(2, '0')}:00`;
      const localEnd = `${dayKey}T${String(hour + 1).padStart(2, '0')}:00`;
      const cellStart = cairoLocalToUtcIso(localStart);
      const cellEnd = cairoLocalToUtcIso(localEnd);

      let state: ScheduleSlotState = 'unavailable';
      if (new Date(cellStart).getTime() < nowMs) {
        state = 'unavailable';
      } else if (booked.some((s) => overlaps(cellStart, cellEnd, s.startsAtUtc, s.endsAtUtc))) {
        state = 'booked';
      } else if (held.some((s) => overlaps(cellStart, cellEnd, s.startsAtUtc, s.endsAtUtc))) {
        state = 'held';
      } else if (freeSlots.some((f) => overlaps(cellStart, cellEnd, f.startsAtUtc, f.endsAtUtc))) {
        state = 'free';
      }

      cells.push({ startsAtUtc: cellStart, endsAtUtc: cellEnd, state });
    }
    days.push({ dayKey, cells });
  }

  return days;
}

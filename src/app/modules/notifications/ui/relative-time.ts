import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';

dayjs.extend(relativeTime);

/** Compact relative time for notification rows, e.g. "2h ago". */
export function formatRelative(iso: string): string {
  return dayjs(iso).fromNow();
}

/** Absolute local timestamp for the hover title, e.g. "Jul 8, 2026 9:12 AM". */
export function formatAbsolute(iso: string): string {
  return dayjs(iso).format('MMM D, YYYY h:mm A');
}

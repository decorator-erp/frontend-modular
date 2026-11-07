/**
 * crmp shared rule "dates are sent as UTC Z". A form date (`yyyy-MM-dd`) is a calendar day, so it is
 * sent as that day at 00:00Z, keeping the day the user picked whatever their offset. A full ISO
 * timestamp is normalised to its UTC `Z` form. Empty → null (the backend clears the field).
 */
export function toUtcDate(value: string | null | undefined): string | null {
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return `${value}T00:00:00Z`;
  const t = Date.parse(value);
  return Number.isNaN(t) ? null : new Date(t).toISOString();
}

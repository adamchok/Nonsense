// Scannable session identity: "Fri 10 Oct · Jordan's place" plus "4:51 PM" for the meta line.
// Day-month order with a short month name, so a date is never an ambiguous 12/10.

const DAY_PARTS = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
const TIME = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });

function part(parts: Intl.DateTimeFormatPart[], type: Intl.DateTimeFormatPartTypes): string {
  return parts.find((p) => p.type === type)?.value ?? '';
}

/** "Fri 10 Oct", with the year appended when it is not the current year ("Fri 10 Oct 2025"). */
export function formatSessionDay(date: Date, now: Date = new Date()): string {
  const parts = DAY_PARTS.formatToParts(date);
  const day = `${part(parts, 'weekday')} ${part(parts, 'day')} ${part(parts, 'month')}`;
  return date.getFullYear() === now.getFullYear() ? day : `${day} ${date.getFullYear()}`;
}

/** "Fri 10 Oct · Jordan's place", or "Fri 10 Oct" when no location is set. */
export function formatSessionTitle(date: Date, location?: string | null, now?: Date): string {
  const day = formatSessionDay(date, now);
  const place = location?.trim();
  return place ? `${day} · ${place}` : day;
}

/** "4:51 PM" (plain spaces; some ICU builds emit a narrow no-break space). */
export function formatSessionTime(date: Date): string {
  return TIME.format(date).replace(/\s/g, ' ');
}

const DAY_PARTS = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
const TIME = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });

function part(parts: Intl.DateTimeFormatPart[], type: Intl.DateTimeFormatPartTypes): string {
  return parts.find((p) => p.type === type)?.value ?? '';
}

export function formatSessionDay(date: Date, now: Date = new Date(), alwaysYear = false): string {
  const parts = DAY_PARTS.formatToParts(date);
  const day = `${part(parts, 'weekday')} ${part(parts, 'day')} ${part(parts, 'month')}`;
  return !alwaysYear && date.getFullYear() === now.getFullYear() ? day : `${day} ${date.getFullYear()}`;
}

export function formatSessionTitle(date: Date, location?: string | null, now?: Date): string {
  const day = formatSessionDay(date, now);
  const place = location?.trim();
  return place ? `${day} · ${place}` : day;
}

export function formatSessionTime(date: Date): string {
  return TIME.format(date).replace(/\s/g, ' ');
}

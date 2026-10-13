const DATE = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

export function formatDate(d: Date): string {
  return DATE.format(d);
}

export function formatDateTime(d: Date): string {
  const date = formatDate(d);
  const rawHours = d.getHours();
  const suffix = rawHours >= 12 ? 'PM' : 'AM';
  const hours12 = rawHours % 12 || 12;
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${date}, ${hours12}:${min} ${suffix}`;
}

export function formatDuration(ms: number): string {
  const totalMinutes = Math.max(0, Math.floor(ms / 60000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours <= 0) return `${minutes}m`;
  return `${hours}h ${minutes}m`;
}

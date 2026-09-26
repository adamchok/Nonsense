export function formatDateDMY(d: Date): string {
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
}

export function formatDateTimeDMY(d: Date): string {
  const date = formatDateDMY(d);
  const rawHours = d.getHours();
  const suffix = rawHours >= 12 ? 'PM' : 'AM';
  const hours12 = rawHours % 12 || 12;
  const h = String(hours12).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${date} ${h}:${min} ${suffix}`;
}

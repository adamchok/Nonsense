/** Date as dd/mm/yyyy (fixed order, not locale-dependent). */
export function formatDateDMY(d: Date): string {
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
}

/** dd/mm/yyyy plus 24h time (for event timestamps). */
export function formatDateTimeDMY(d: Date): string {
  const date = formatDateDMY(d);
  const h = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${date} ${h}:${min}`;
}

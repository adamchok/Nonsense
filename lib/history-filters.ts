import { parseAmount } from './parse-amount.ts';

export type FilterState = {
  locations: string[] | null;
  startDate: string;
  endDate: string;
  buyInMin: string;
  buyInMax: string;
  profitMin: string;
  profitMax: string;
};

export const DEFAULT_FILTERS: FilterState = {
  locations: null,
  startDate: '',
  endDate: '',
  buyInMin: '',
  buyInMax: '',
  profitMin: '',
  profitMax: '',
};

type FilterableEntry = { date: Date; location?: string | null; totalBuyIn: number; profit: number };

export function toYmd(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

export function parseYmd(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const [year, month, day] = [Number(match[1]), Number(match[2]) - 1, Number(match[3])];
  const date = new Date(year, month, day);
  if (date.getFullYear() !== year || date.getMonth() !== month || date.getDate() !== day) return null;
  return date;
}

function parseAmountInput(value: string): number | null {
  const trimmed = value.trim();
  return trimmed ? parseAmount(trimmed) : null;
}

export function countActiveFilters(f: FilterState): number {
  return [
    f.locations !== null,
    Boolean(f.startDate || f.endDate),
    Boolean(f.buyInMin.trim() || f.buyInMax.trim()),
    Boolean(f.profitMin.trim() || f.profitMax.trim()),
  ].filter(Boolean).length;
}

export function filterEntries<T extends FilterableEntry>(entries: readonly T[], f: FilterState): T[] {
  const start = parseYmd(f.startDate);
  const end = parseYmd(f.endDate);
  const endExclusive = end ? new Date(end.getFullYear(), end.getMonth(), end.getDate() + 1) : null;
  const buyInMin = parseAmountInput(f.buyInMin);
  const buyInMax = parseAmountInput(f.buyInMax);
  const profitMin = parseAmountInput(f.profitMin);
  const profitMax = parseAmountInput(f.profitMax);

  return entries.filter((e) => {
    if (f.locations !== null && !f.locations.includes(e.location?.trim() ?? '')) return false;
    if (start && e.date < start) return false;
    if (endExclusive && e.date >= endExclusive) return false;
    if (buyInMin !== null && e.totalBuyIn < buyInMin) return false;
    if (buyInMax !== null && e.totalBuyIn > buyInMax) return false;
    if (profitMin !== null && e.profit < profitMin) return false;
    if (profitMax !== null && e.profit > profitMax) return false;
    return true;
  });
}

export type DatePreset = 'all' | '30d' | '3m' | 'year';

export const DATE_PRESETS: { key: DatePreset; label: string }[] = [
  { key: 'all', label: 'Any time' },
  { key: '30d', label: 'Last 30 days' },
  { key: '3m', label: 'Last 3 months' },
  { key: 'year', label: 'This year' },
];

export function presetRange(key: DatePreset, today: Date): { start: string; end: string } {
  const y = today.getFullYear();
  const m = today.getMonth();
  const d = today.getDate();
  if (key === 'all') return { start: '', end: '' };
  const end = toYmd(today);
  if (key === '30d') return { start: toYmd(new Date(y, m, d - 29)), end };
  if (key === '3m') return { start: toYmd(new Date(y, m - 3, d + 1)), end };
  return { start: toYmd(new Date(y, 0, 1)), end };
}

export function monthGrid(year: number, month: number): (Date | null)[] {
  const lead = (new Date(year, month, 1).getDay() + 6) % 7;
  const days = new Date(year, month + 1, 0).getDate();
  const cells: (Date | null)[] = Array.from({ length: lead }, () => null);
  for (let day = 1; day <= days; day++) cells.push(new Date(year, month, day));
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

export interface ShareResult {
  playerName: string;
  profit: number;
}

export interface ShareSettlement {
  from: string;
  to: string;
  amount: number;
}

export interface SessionShareInput {
  date?: Date;
  location?: string;
  hostName?: string;
  blinds?: string | null;
  duration?: string;
  results: readonly ShareResult[];
  settlements: readonly ShareSettlement[];
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function shortMoney(amount: number): string {
  const abs = Math.abs(amount);
  const text = Number.isInteger(abs)
    ? abs.toLocaleString('en-US')
    : abs.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `$${text}`;
}

export function signedShortMoney(amount: number): string {
  if (amount > 0) return `+${shortMoney(amount)}`;
  if (amount < 0) return `-${shortMoney(amount)}`;
  return shortMoney(0);
}

function shareDate(date: Date): string {
  return `${WEEKDAYS[date.getDay()]} ${date.getDate()} ${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
}

function resultDot(profit: number): string {
  if (profit > 0) return '🟢';
  if (profit < 0) return '🔴';
  return '⚪';
}

export function buildSessionShareText(input: SessionShareInput, { bold }: { bold: boolean }): string {
  const b = (text: string) => (bold ? `*${text}*` : text);
  const lines: string[] = [];

  lines.push(`🃏 ${b(input.date ? `Nonsense · ${shareDate(input.date)}` : 'Nonsense')}`);
  const details = [
    input.location?.trim() || null,
    input.blinds ? input.blinds.replace(/\.00\b/g, '') : null,
    input.duration && input.duration !== 'N/A' ? input.duration : null,
  ].filter(Boolean);
  if (details.length) lines.push(`📍 ${details.join(' · ')}`);
  if (input.hostName?.trim()) lines.push(`👑 Host: ${input.hostName.trim()}`);

  lines.push('', b('Results'));
  for (const r of input.results) {
    lines.push(`${resultDot(r.profit)} ${r.playerName}  ${signedShortMoney(r.profit)}`);
  }

  lines.push('', b('Settle up'));
  if (input.settlements.length === 0) {
    lines.push('✅ No payments needed');
  } else {
    for (const s of input.settlements) {
      lines.push(`💸 ${s.from} → ${s.to}  ${b(shortMoney(s.amount))}`);
    }
  }

  return lines.join('\n');
}

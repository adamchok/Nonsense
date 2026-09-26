import { formatBlinds, formatBlindsChips } from '@/lib/currency-format';
import { formatDateTimeDMY } from '@/lib/date-format';
import type { SessionAmountUnit } from '@/types';
import { Timestamp } from 'firebase/firestore';

export type SessionView = {
  hostId?: string;
  date?: Date;
  location?: string;
  smallBlind?: number;
  bigBlind?: number;
  amountUnit: SessionAmountUnit;
  dollarsPerChip?: number;
  status: 'active' | 'finished';
  participantIds: string[];
};

export type LedgerPlayer = {
  playerId: string;
  name: string;
  total: number;
};

export function sessionBlindsFromData(data: Record<string, unknown>): {
  smallBlind?: number;
  bigBlind?: number;
} {
  const rawSb = data.smallBlind;
  const rawBb = data.bigBlind;
  if (rawSb == null || rawBb == null) return {};
  const sb = typeof rawSb === 'number' ? rawSb : Number(rawSb);
  const bb = typeof rawBb === 'number' ? rawBb : Number(rawBb);
  if (!Number.isFinite(sb) || !Number.isFinite(bb) || sb <= 0 || bb < sb) return {};
  return { smallBlind: sb, bigBlind: bb };
}

export function toDate(value: unknown): Date | undefined {
  if (value instanceof Timestamp) return value.toDate();
  if (value instanceof Date) return value;
  return undefined;
}

export function sessionViewFromData(data: Record<string, unknown>): SessionView {
  const amountUnit: SessionAmountUnit = data.amountUnit === 'chips' ? 'chips' : 'cash';
  const rawDpc = data.dollarsPerChip;
  const dpcParsed = typeof rawDpc === 'number' ? rawDpc : Number(rawDpc);
  const dollarsPerChip =
    amountUnit === 'chips' && Number.isFinite(dpcParsed) && dpcParsed > 0 ? dpcParsed : undefined;
  return {
    hostId: data.hostId ? String(data.hostId) : undefined,
    date: toDate(data.date ?? data.createdAt),
    location: data.location ? String(data.location) : undefined,
    ...sessionBlindsFromData(data),
    amountUnit,
    ...(dollarsPerChip != null ? { dollarsPerChip } : {}),
    status: data.status === 'finished' ? 'finished' : 'active',
    participantIds: Array.isArray(data.participantIds)
      ? data.participantIds.filter((p): p is string => typeof p === 'string')
      : [],
  };
}

export function sessionBlindsAreSet(session: SessionView | null): boolean {
  if (!session) return false;
  if (session.amountUnit === 'chips') {
    return formatBlindsChips(session.smallBlind, session.bigBlind) != null;
  }
  return formatBlinds(session.smallBlind, session.bigBlind) != null;
}

export function formatCashOutTimestamp(d: Date): string {
  try {
    return formatDateTimeDMY(d);
  } catch {
    return '—';
  }
}

export function isValidBlinds(sb: number | null, bb: number | null): boolean {
  return sb != null && bb != null && Number.isFinite(sb) && Number.isFinite(bb) && sb > 0 && bb >= sb;
}

export function ledgerRowValues(
  total: number,
  cashOutAmount: number | undefined,
  dollarsPerChip: number | undefined
): { buyIn: number; cashOut: number; result: number } {
  const scale = dollarsPerChip ?? 1;
  if (cashOutAmount == null) return { buyIn: total * scale, cashOut: 0, result: 0 };
  return {
    buyIn: total * scale,
    cashOut: cashOutAmount * scale,
    result: (cashOutAmount - total) * scale,
  };
}

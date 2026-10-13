import { formatBlinds, formatBlindsChips } from './currency-format.ts';
import { formatDateTime } from './date-format.ts';
import { optStr, sessionSummaryFromDocData } from './firestore-coerce.ts';
import type { SessionAmountUnit } from '@/types';
import { Timestamp } from 'firebase/firestore';

export type SessionView = {
  hostId?: string;
  groupId?: string;
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

export function toDate(value: unknown): Date | undefined {
  if (value instanceof Timestamp) return value.toDate();
  if (value instanceof Date) return value;
  return undefined;
}

export function sessionViewFromData(data: Record<string, unknown>): SessionView {
  return {
    ...sessionSummaryFromDocData(data),
    hostId: optStr(data.hostId),
    groupId: optStr(data.groupId),
    date: toDate(data.date ?? data.createdAt),
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
    return formatDateTime(d);
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

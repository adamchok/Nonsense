import type { PokerGroup, SessionAmountUnit } from '@/types';

export const MAX_SESSION_PLAYERS = 50;
export const SESSION_PLAYER_LIMIT_MESSAGE = `Sessions can have up to ${MAX_SESSION_PLAYERS} players.`;
export const MAX_LOCATION_LENGTH = 100;
export const MAX_GROUP_NAME_LENGTH = 64;
export const MAX_GROUP_NAME_INPUT_LENGTH = 40;
export const MAX_PLAYER_NAME_LENGTH = 64;

const MAX_LOGGED_VALUE_LENGTH = 80;

export type FirestoreData = Record<string, unknown>;

export function isPlainObject(value: unknown): value is FirestoreData {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function str(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

export function optStr(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

export function finiteNum(value: unknown): number | undefined {
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

function describeValue(value: unknown): string {
  if (value === undefined) return 'missing';
  if (value === null) return 'null';
  if (typeof value === 'object') return Array.isArray(value) ? 'an array' : 'a map';
  const shown = typeof value === 'string' ? value.slice(0, MAX_LOGGED_VALUE_LENGTH) : value;
  const suffix = typeof value === 'string' && value.length > MAX_LOGGED_VALUE_LENGTH ? `… (${value.length} chars)` : '';
  return `${typeof value} ${JSON.stringify(shown)}${suffix}`;
}

export function clipText(value: string, max: number): string {
  if (value.length <= max) return value;
  const clipped = value.slice(0, max);
  const last = clipped.charCodeAt(clipped.length - 1);
  return last >= 0xd800 && last <= 0xdbff ? clipped.slice(0, -1) : clipped;
}

export function sessionPlayerIds(hostId: string, playerIds: readonly string[]): string[] {
  return [...new Set([hostId, ...playerIds])];
}

export function canDecrementMemberCount(value: unknown): boolean {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

export function numOrZero(data: unknown, key: string, ctx: string): number {
  const v = isPlainObject(data) ? data[key] : undefined;
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  console.warn(`[Firestore] ${ctx}: numeric field "${key}" is ${describeValue(v)}; treating as 0`);
  return 0;
}

export function tryMap<T>(ctx: string, map: () => T): T | undefined {
  try {
    return map();
  } catch (err) {
    console.warn(`[Firestore] ${ctx}: skipping malformed document`, err);
    return undefined;
  }
}

export function mapDocsSafely<D extends { id: string }, T>(
  docs: readonly D[],
  ctx: string,
  map: (d: D) => T
): T[] {
  const out: T[] = [];
  for (const d of docs) {
    const mapped = tryMap(`${ctx}/${d.id}`, () => map(d));
    if (mapped !== undefined) out.push(mapped);
  }
  return out;
}

export function storedPlayerResults(data: FirestoreData): FirestoreData | null {
  const map = data.playerResults;
  return isPlainObject(map) ? map : null;
}

export function storedPlayerResult(data: FirestoreData, playerId: string): FirestoreData | null | undefined {
  const stored = storedPlayerResults(data);
  if (!stored) return undefined;
  const entry = stored[playerId];
  return isPlainObject(entry) ? entry : null;
}

export function storedProfitEntries(sessionId: string, data: FirestoreData): [string, number][] | null {
  const stored = storedPlayerResults(data);
  if (!stored) return null;
  const out: [string, number][] = [];
  for (const [playerId, entry] of Object.entries(stored)) {
    if (!isPlainObject(entry)) continue;
    out.push([playerId, numOrZero(entry, 'profit', `sessions/${sessionId}.playerResults.${playerId}`)]);
  }
  return out;
}

export function isOversizedSession(data: FirestoreData): boolean {
  const ids = data.participantIds;
  if (Array.isArray(ids) && ids.length > MAX_SESSION_PLAYERS) return true;
  const stored = storedPlayerResults(data);
  return stored !== null && Object.keys(stored).length > MAX_SESSION_PLAYERS;
}

export function sessionBlindsFromDocData(data: FirestoreData): {
  smallBlind?: number;
  bigBlind?: number;
} {
  if (data.smallBlind == null || data.bigBlind == null) return {};
  const sb = finiteNum(data.smallBlind);
  const bb = finiteNum(data.bigBlind);
  if (sb === undefined || bb === undefined || sb <= 0 || bb < sb) return {};
  return { smallBlind: sb, bigBlind: bb };
}

export function sessionAmountMetaFromDocData(data: FirestoreData): {
  amountUnit: SessionAmountUnit;
  dollarsPerChip?: number;
} {
  if (data.amountUnit !== 'chips') return { amountUnit: 'cash' };
  const n = finiteNum(data.dollarsPerChip);
  return { amountUnit: 'chips', dollarsPerChip: n !== undefined && n > 0 ? n : undefined };
}

export function sessionSummaryFromDocData(data: FirestoreData): {
  hostId: string;
  location?: string;
  smallBlind?: number;
  bigBlind?: number;
  amountUnit: SessionAmountUnit;
  dollarsPerChip?: number;
} {
  const { amountUnit, dollarsPerChip } = sessionAmountMetaFromDocData(data);
  return {
    hostId: str(data.hostId),
    location: optStr(data.location),
    ...sessionBlindsFromDocData(data),
    amountUnit,
    ...(amountUnit === 'chips' && dollarsPerChip != null ? { dollarsPerChip } : {}),
  };
}

export function groupFromMembershipData(id: string, data: FirestoreData): Omit<PokerGroup, 'createdAt'> {
  return {
    id,
    name: str(data.name),
    memberCount: finiteNum(data.memberCount) ?? 0,
    ownerId: str(data.ownerId),
    myRole: data.role === 'owner' ? 'owner' : 'member',
  };
}

import { collection, doc, getDocs, writeBatch } from 'firebase/firestore';

import { getFirestoreDb } from '@/lib/firebase';
import { normalizeText } from '@/lib/voice-command';

/** playerId -> heard names that meant that player, newest first. Stored per host in players/{uid}/voice_aliases. */
export type VoiceAliases = Readonly<Record<string, readonly string[]>>;

export const MAX_ALIASES_PER_PLAYER = 10;
const MAX_ALIAS_LENGTH = 40;
const MIN_ALIAS_LENGTH = 2;

const aliasCollection = (uid: string) => collection(getFirestoreDb(), 'players', uid, 'voice_aliases');

export async function loadVoiceAliases(uid: string): Promise<VoiceAliases> {
  try {
    const snap = await getDocs(aliasCollection(uid));
    const out: Record<string, string[]> = {};
    for (const d of snap.docs) {
      const list = d.get('aliases');
      if (!Array.isArray(list)) continue;
      const aliases = list.filter((a): a is string => typeof a === 'string' && a.length > 0);
      if (aliases.length > 0) out[d.id] = aliases.slice(0, MAX_ALIASES_PER_PLAYER);
    }
    return out;
  } catch (e) {
    console.warn('Could not load voice aliases', e);
    return {};
  }
}

/** Pure: the alias map after learning that `heard` meant `playerId`, or null when nothing changes. */
export function withVoiceAlias(current: VoiceAliases, playerId: string, heard: string): VoiceAliases | null {
  const alias = normalizeText(heard);
  if (!playerId || alias.replace(/\s/g, '').length < MIN_ALIAS_LENGTH || alias.length > MAX_ALIAS_LENGTH) {
    return null;
  }
  const existing = current[playerId] ?? [];
  if (existing[0] === alias) return null;
  // A heard name belongs to one player only: a correction moves it off whoever had it before.
  const next: Record<string, readonly string[]> = {};
  for (const [id, list] of Object.entries(current)) {
    if (id === playerId) continue;
    const kept = list.filter((a) => a !== alias);
    if (kept.length > 0) next[id] = kept;
  }
  next[playerId] = [alias, ...existing.filter((a) => a !== alias)].slice(0, MAX_ALIASES_PER_PLAYER);
  return next;
}

/** Saves `heard` as an alias of `playerId`. Returns the updated map, or null if nothing changed or the write failed. */
export async function addVoiceAlias(
  uid: string,
  current: VoiceAliases,
  playerId: string,
  heard: string
): Promise<VoiceAliases | null> {
  const next = withVoiceAlias(current, playerId, heard);
  if (!next) return null;
  try {
    const batch = writeBatch(getFirestoreDb());
    const ids = new Set([...Object.keys(current), ...Object.keys(next)]);
    for (const id of ids) {
      if (current[id] === next[id]) continue;
      const ref = doc(aliasCollection(uid), id);
      if (next[id]) batch.set(ref, { aliases: [...next[id]] });
      else batch.delete(ref);
    }
    await batch.commit();
    return next;
  } catch (e) {
    console.warn('Could not save voice alias', e);
    return null;
  }
}

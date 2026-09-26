import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import type { RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, setDoc, setLogLevel } from 'firebase/firestore';
import type { Firestore } from 'firebase/firestore';

export const PROJECT_ID = 'demo-nonsense';

export const HOST = 'host-uid';
export const PLAYER = 'player-uid';
export const OTHER_PLAYER = 'other-player-uid';
export const STRANGER = 'stranger-uid';

export async function createRulesEnv(): Promise<RulesTestEnvironment> {
  setLogLevel('error');
  return initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: readFileSync(resolve(import.meta.dirname, '../../firestore.rules'), 'utf8'),
    },
  });
}

export function dbAs(env: RulesTestEnvironment, uid: string): Firestore {
  return env.authenticatedContext(uid).firestore() as unknown as Firestore;
}

export interface SeedSessionOptions {
  status?: 'active' | 'finished';
  participantIds?: string[] | null;
}

export async function seedSession(
  env: RulesTestEnvironment,
  sessionId: string,
  { status = 'active', participantIds = [HOST, PLAYER, OTHER_PLAYER] }: SeedSessionOptions = {}
): Promise<void> {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore() as unknown as Firestore;
    await setDoc(doc(db, 'sessions', sessionId), {
      hostId: HOST,
      date: new Date(),
      location: null,
      status,
      smallBlind: null,
      bigBlind: null,
      amountUnit: 'cash',
      dollarsPerChip: null,
      ...(participantIds ? { participantIds } : {}),
    });
    const rows = participantIds ?? [HOST, PLAYER, OTHER_PLAYER];
    for (const uid of rows) {
      await setDoc(doc(db, 'sessions', sessionId, 'session_participants', uid), {
        playerId: uid,
        playerName: uid,
        joinedAt: new Date(),
      });
    }
  });
}

export async function seedDoc(
  env: RulesTestEnvironment,
  path: string,
  data: Record<string, unknown>
): Promise<void> {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore() as unknown as Firestore, path), data);
  });
}

let counter = 0;
export function nextSessionId(prefix: string): string {
  counter += 1;
  return `${prefix}-${counter}`;
}

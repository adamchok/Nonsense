/**
 * Shared setup for the Firestore security-rules tests. These need the Firestore emulator:
 *
 *   npm run test:rules   (wraps node --test in `firebase emulators:exec --only firestore`)
 *
 * `emulators:exec` exports FIRESTORE_EMULATOR_HOST, which initializeTestEnvironment reads.
 * Seed data is written with rules disabled; every assertion goes through a signed-in (or
 * anonymous) context so it is evaluated against firestore.rules exactly as the app sees it.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import type { RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, setDoc, setLogLevel } from 'firebase/firestore';
import type { Firestore } from 'firebase/firestore';

/** Must match the --project passed to emulators:exec in the test:rules script. */
export const PROJECT_ID = 'demo-nonsense';

export const HOST = 'host-uid';
export const PLAYER = 'player-uid';
export const OTHER_PLAYER = 'other-player-uid';
export const STRANGER = 'stranger-uid';

export async function createRulesEnv(): Promise<RulesTestEnvironment> {
  // Every assertFails() makes the SDK log the PERMISSION_DENIED stream error at warn level.
  setLogLevel('error');
  return initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: readFileSync(resolve(import.meta.dirname, '../../firestore.rules'), 'utf8'),
    },
  });
}

/** Firestore for a signed-in user. The compat instance is accepted by the modular API. */
export function dbAs(env: RulesTestEnvironment, uid: string): Firestore {
  return env.authenticatedContext(uid).firestore() as unknown as Firestore;
}

export interface SeedSessionOptions {
  status?: 'active' | 'finished';
  /** Pass null to omit the field entirely (legacy docs written before the mirror existed). */
  participantIds?: string[] | null;
}

/** Writes a session doc (plus its session_participants rows) with rules disabled. */
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

/** Writes any doc with rules disabled. */
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
/** Unique id per test so tests never observe each other's writes. */
export function nextSessionId(prefix: string): string {
  counter += 1;
  return `${prefix}-${counter}`;
}

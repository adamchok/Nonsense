const FIREBASE_MESSAGES: Record<string, string> = {
  unavailable: "Can't reach the server. Check your connection and try again.",
  'deadline-exceeded': "Can't reach the server. Check your connection and try again.",
  'permission-denied': "You don't have access to this.",
  'resource-exhausted': 'Too many requests. Wait a moment and try again.',
};

function isFirebaseError(e: unknown): e is Error & { code: string } {
  return e instanceof Error && e.name === 'FirebaseError' && typeof (e as { code?: unknown }).code === 'string';
}

export function userMessage(e: unknown, fallback: string): string {
  if (isFirebaseError(e)) {
    console.warn(`[${e.code}] ${e.message}`);
    return FIREBASE_MESSAGES[e.code] ?? fallback;
  }
  return e instanceof Error && e.message ? e.message : fallback;
}

export class ParticipantNotAllowedError extends Error {
  constructor(name: string, options?: { cause?: unknown; isGroupSession?: boolean }) {
    const reason = options?.isGroupSession ? "isn't your friend or in this group" : "isn't your friend";
    super(`${name} ${reason}, so they can't be added.`, { cause: options?.cause });
    this.name = 'ParticipantNotAllowedError';
  }
}

export function participantAddError(e: unknown, name: string, isGroupSession = false): unknown {
  return isFirebaseError(e) && e.code === 'permission-denied'
    ? new ParticipantNotAllowedError(name, { cause: e, isGroupSession })
    : e;
}

import { createAvatar } from '@dicebear/core';
import * as notionists from '@dicebear/notionists';

// Illustrated faces ("Notionists" by Zoish, CC0 1.0, rendered by DiceBear). Stored in the existing
// `avatarEmoji` field as `nf:<seed>`, so denormalised copies and Firestore rules keep working unchanged.
// Anything without the prefix is a legacy emoji and still renders as text.
export const FACE_PREFIX = 'nf:';
/** Faces are black line art, so they always sit on this light disc (readable on dark theme too). */
export const FACE_DISC = '#fbf1da';

export function isFaceAvatar(value: string | null | undefined): value is string {
  return !!value && value.startsWith(FACE_PREFIX);
}

export function faceValue(seed: string): string {
  return `${FACE_PREFIX}${seed}`;
}

const FACE_SCALE = 130;
const FACE_SHIFT_Y = 8;

// ponytail: unbounded cache, fine for the few hundred faces a session shows; switch to an LRU if it ever grows.
const svgCache = new Map<string, string>();

export function faceSvg(value: string): string {
  const seed = value.slice(FACE_PREFIX.length);
  let svg = svgCache.get(seed);
  if (!svg) {
    // Zoom into the head: at 24-62px the full-body framing leaves sub-pixel ink lines that render as grey fuzz.
    svg = createAvatar(notionists, { seed, scale: FACE_SCALE, translateY: FACE_SHIFT_Y }).toString();
    svgCache.set(seed, svg);
  }
  return svg;
}

export function randomFaceSeeds(count: number): string[] {
  return Array.from({ length: count }, () => Math.random().toString(36).slice(2, 10));
}

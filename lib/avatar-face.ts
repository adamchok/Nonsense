import { createAvatar } from '@dicebear/core';
import * as notionists from '@dicebear/notionists';

export const FACE_PREFIX = 'nf:';
export const FACE_DISC = '#fbf1da';

export function isFaceAvatar(value: string | null | undefined): value is string {
  return !!value && value.startsWith(FACE_PREFIX);
}

export function faceValue(seed: string): string {
  return `${FACE_PREFIX}${seed}`;
}

const FACE_SCALE = 130;
const FACE_SHIFT_Y = 8;

const svgCache = new Map<string, string>();

export function faceSvg(value: string): string {
  const seed = value.slice(FACE_PREFIX.length);
  let svg = svgCache.get(seed);
  if (!svg) {
    svg = createAvatar(notionists, { seed, scale: FACE_SCALE, translateY: FACE_SHIFT_Y, clip: false })
      .toString()
      .replace(/<metadata[\s\S]*?<\/metadata>/, '');
    svgCache.set(seed, svg);
  }
  return svg;
}

export function randomFaceSeeds(count: number): string[] {
  return Array.from({ length: count }, () => Math.random().toString(36).slice(2, 10));
}

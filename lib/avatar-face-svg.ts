import { FACE_PREFIX } from '@/lib/avatar-face';
import { createAvatar } from '@dicebear/core';
import * as notionists from '@dicebear/notionists';

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

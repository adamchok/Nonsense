export const FACE_PREFIX = 'nf:';
export const FACE_DISC = '#fbf1da';

export function isFaceAvatar(value: string | null | undefined): value is string {
  return !!value && value.startsWith(FACE_PREFIX);
}

export function faceValue(seed: string): string {
  return `${FACE_PREFIX}${seed}`;
}

export function randomFaceSeeds(count: number): string[] {
  return Array.from({ length: count }, () => Math.random().toString(36).slice(2, 10));
}

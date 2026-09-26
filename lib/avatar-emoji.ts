/** Some stored avatars carry literal quotes (e.g. `"🐸"`), so strip them along with whitespace. */
export function normalizeAvatarEmoji(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const cleaned = value.trim().replace(/^["'“”‘’]+|["'“”‘’]+$/g, '').trim();
  return cleaned.length > 0 ? cleaned : undefined;
}

export function normalizeAvatarEmoji(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const cleaned = value.trim().replace(/^["'“”‘’]+|["'“”‘’]+$/g, '').trim();
  return cleaned.length > 0 ? cleaned : undefined;
}

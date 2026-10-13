import * as Sharing from 'expo-sharing';
import type { RefObject } from 'react';
import type { View } from 'react-native';
import { captureRef } from 'react-native-view-shot';

export function isShareCancel(e: unknown): boolean {
  return e instanceof Error && (e.name === 'AbortError' || /cancel/i.test(e.message));
}

export async function shareViewAsImage(
  ref: RefObject<View | null>,
  { title }: { fileName: string; title: string },
): Promise<void> {
  if (!ref.current) return;
  const uri = await captureRef(ref, { format: 'png', result: 'tmpfile' });
  if (!(await Sharing.isAvailableAsync())) throw new Error('This device cannot share images.');
  await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: title, UTI: 'public.png' });
}

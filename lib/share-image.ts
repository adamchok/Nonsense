import * as Sharing from 'expo-sharing';
import type { RefObject } from 'react';
import { Platform, type View } from 'react-native';
import { captureRef } from 'react-native-view-shot';

const SHARE_IMAGE_SCALE = 3;

export function isShareCancel(e: unknown): boolean {
  return e instanceof Error && (e.name === 'AbortError' || /cancel/i.test(e.message));
}

export async function shareViewAsImage(
  ref: RefObject<View | null>,
  { fileName, title }: { fileName: string; title: string },
): Promise<void> {
  if (!ref.current) return;
  if (Platform.OS === 'web') {
    const { default: html2canvas } = await import('html2canvas');
    const canvas = await html2canvas(ref.current as unknown as HTMLElement, {
      scale: SHARE_IMAGE_SCALE,
      backgroundColor: null,
      useCORS: true,
    });
    const dataUri = canvas.toDataURL('image/png');
    const blob = await (await fetch(dataUri)).blob();
    const file = new File([blob], fileName, { type: 'image/png' });
    if (typeof navigator !== 'undefined' && navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title });
      return;
    }
    const link = document.createElement('a');
    link.href = dataUri;
    link.download = fileName;
    link.click();
    return;
  }
  const uri = await captureRef(ref, { format: 'png', result: 'tmpfile' });
  if (!(await Sharing.isAvailableAsync())) throw new Error('This device cannot share images.');
  await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: title, UTI: 'public.png' });
}

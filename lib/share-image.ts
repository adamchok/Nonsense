import * as Sharing from 'expo-sharing';
import type { RefObject } from 'react';
import { Platform, type View } from 'react-native';
import { captureRef } from 'react-native-view-shot';

/** Exported PNGs are 3x the on-screen size so they stay crisp in chats. */
const SHARE_IMAGE_SCALE = 3;

/** The user closing the share sheet is not an error. */
export function isShareCancel(e: unknown): boolean {
  return e instanceof Error && (e.name === 'AbortError' || /cancel/i.test(e.message));
}

/**
 * Captures a rendered view as a PNG and hands it to the share sheet.
 * Web: html2canvas at 3x (view-shot's web capture has no scale option), then Web Share with the file,
 * or a download when the browser cannot share files. Native: view-shot tmpfile + expo-sharing.
 * Throws on failure, including a cancelled share sheet (check with isShareCancel).
 */
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

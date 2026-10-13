import type { RefObject } from 'react';
import type { View } from 'react-native';

const SHARE_IMAGE_SCALE = 3;

export function isShareCancel(e: unknown): boolean {
  return e instanceof Error && (e.name === 'AbortError' || /cancel/i.test(e.message));
}

export async function shareViewAsImage(
  ref: RefObject<View | null>,
  { fileName, title }: { fileName: string; title: string },
): Promise<void> {
  if (!ref.current) return;
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
}

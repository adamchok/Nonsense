import { useEffect } from 'react';
import { Platform } from 'react-native';

export function useOutsidePress(open: boolean, onClose: () => void, elementIds: readonly string[]): void {
  const idsKey = elementIds.join(' ');
  useEffect(() => {
    if (Platform.OS !== 'web' || !open) return;
    const ids = idsKey.split(' ');
    const handle = (e: PointerEvent) => {
      const target = e.target as Node | null;
      if (target && ids.some((id) => document.getElementById(id)?.contains(target))) return;
      onClose();
    };
    document.addEventListener('pointerdown', handle, true);
    return () => document.removeEventListener('pointerdown', handle, true);
  }, [open, onClose, idsKey]);
}

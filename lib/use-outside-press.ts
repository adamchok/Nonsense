import { useEffect } from 'react';
import { Platform } from 'react-native';

/**
 * Web: closes an open dropdown on any pointer-down outside the given elements (menu + its trigger),
 * wherever it lands: header, sidebar, tab bar or empty space. An in-content backdrop only covers the
 * scroll content, so clicks elsewhere left the menu open. Native keeps its backdrop Pressable.
 */
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

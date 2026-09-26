// Web only: global interaction feedback (hover, focus-visible, pressed, disabled) for every
// clickable element react-native-web renders. Importing this module loads the stylesheet;
// Metro emits it as a <link> in the exported HTML. Native resolves web-interactions.ts instead.
import './web-interactions.css';

/**
 * Mirrors the in-app theme (which may differ from prefers-color-scheme) onto <html> so the CSS
 * layer can pick light/dark feedback and accent colors. Guarded for static rendering.
 */
export function applyWebTheme(scheme: 'light' | 'dark'): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.dataset.theme = scheme;
  root.style.colorScheme = scheme;
}

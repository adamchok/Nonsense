import './web-interactions.css';

export function applyWebTheme(scheme: 'light' | 'dark', isReady: boolean): void {
  if (typeof document === 'undefined' || !isReady) return;
  const root = document.documentElement;
  root.dataset.theme = scheme;
  root.style.colorScheme = scheme;
  delete root.dataset.themePending;
}

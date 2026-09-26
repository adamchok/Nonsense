// Native: no-op. The web build (web-interactions.web.ts) loads a global CSS layer that gives
// every clickable element hover / focus-visible / pressed / disabled feedback.

/** Mirrors the in-app theme to the document so the web CSS layer can follow it. */
export function applyWebTheme(_scheme: 'light' | 'dark'): void {}

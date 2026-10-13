import { createElement, useEffect, useState } from 'react';
import { useReducedMotion } from 'react-native-reanimated';

const CLIPS = ['live-session', 'settle-up', 'history', 'friends'] as const;
const VIDEO_STYLE = { width: '100%', height: '100%', objectFit: 'cover', display: 'block' } as const;

function startMuted(video: HTMLVideoElement | null) {
  if (!video) return;
  video.muted = true;
  video.play().catch(() => {});
}

function posterFor(clip: string): string {
  return `/media/${clip}.jpg`;
}

export function AuthPreviewScreen({ dark }: { dark: boolean }) {
  const reduceMotion = useReducedMotion();
  const [index, setIndex] = useState(0);
  const names = CLIPS.map((name) => (dark ? name : `${name}-light`));
  const clip = names[index];

  useEffect(() => {
    for (const name of CLIPS) new Image().src = posterFor(dark ? name : `${name}-light`);
  }, [dark]);

  if (reduceMotion) {
    return createElement('img', { src: posterFor(clip), alt: '', style: VIDEO_STYLE });
  }

  return createElement(
    'div',
    { style: { ...VIDEO_STYLE, backgroundImage: `url(${posterFor(clip)})`, backgroundSize: 'cover' } },
    createElement('video', {
      key: clip,
      ref: startMuted,
      src: `/media/${clip}.webm`,
      poster: posterFor(clip),
      muted: true,
      playsInline: true,
      preload: 'auto',
      onEnded: () => setIndex((i) => (i + 1) % CLIPS.length),
      style: VIDEO_STYLE,
    }),
  );
}

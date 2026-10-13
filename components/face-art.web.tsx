import { lazy, Suspense } from 'react';
import { SvgXml } from 'react-native-svg';

import type { FaceArtProps } from '@/components/face-art';

const LazyFaceArt = lazy(() =>
  import('@/lib/avatar-face-svg').then(({ faceSvg }) => ({
    default: function LoadedFaceArt({ value, size }: FaceArtProps) {
      return <SvgXml xml={faceSvg(value)} width={size} height={size} />;
    },
  })),
);

export function FaceArt(props: FaceArtProps) {
  return (
    <Suspense fallback={null}>
      <LazyFaceArt {...props} />
    </Suspense>
  );
}

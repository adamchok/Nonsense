import { faceSvg } from '@/lib/avatar-face-svg';
import { SvgXml } from 'react-native-svg';

export type FaceArtProps = { value: string; size: number };

export function FaceArt({ value, size }: FaceArtProps) {
  return <SvgXml xml={faceSvg(value)} width={size} height={size} />;
}

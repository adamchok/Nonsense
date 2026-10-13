import type { AppColors } from '@/lib/app-theme';
import { pointer } from '@/lib/ui';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Defs, FeGaussianBlur, Filter, Rect } from 'react-native-svg';

const HALO_SPREAD = 6;
const HALO_ROOM = 180;
const HALO_BLUR = 46;
const HALO_ALPHA_LIGHT = 0.5;
const HALO_ALPHA_DARK = 0.35;

export function CopyScrim(_props: { color: string }) {
  return null;
}

export function BrandGlow(_props: { c: AppColors; dark: boolean }) {
  return null;
}

export function PhoneGlow({ c, dark }: { c: AppColors; dark: boolean }) {
  const [size, setSize] = useState({ width: 0, height: 0 });
  const inner = HALO_ROOM - HALO_SPREAD;
  return (
    <View
      style={[styles.halo, pointer.none]}
      onLayout={(e) => setSize({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height })}>
      {size.width > 0 ? (
        <Svg width={size.width} height={size.height}>
          <Defs>
            <Filter id="haloBlur" x="-50%" y="-50%" width="200%" height="200%">
              <FeGaussianBlur stdDeviation={HALO_BLUR} />
            </Filter>
          </Defs>
          <Rect
            x={inner}
            y={inner}
            width={Math.max(0, size.width - inner * 2)}
            height={Math.max(0, size.height - inner * 2)}
            rx={32 + HALO_SPREAD}
            fill={c.accent}
            fillOpacity={dark ? HALO_ALPHA_DARK : HALO_ALPHA_LIGHT}
            filter="url(#haloBlur)"
          />
        </Svg>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  halo: { position: 'absolute', top: -HALO_ROOM, left: -HALO_ROOM, right: -HALO_ROOM, bottom: -HALO_ROOM },
});

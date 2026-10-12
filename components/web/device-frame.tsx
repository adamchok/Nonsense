import { type AppColors } from '@/lib/app-theme';
import { pointer } from '@/lib/ui';
import { useSyncExternalStore, type ReactNode } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

export type DeviceKind = 'ios' | 'android';

/** Android visitors see an Android phone; everyone else (iPhone, Mac, Windows) an iPhone. */
export function useDeviceKind(): DeviceKind {
  // Server snapshot 'ios' keeps the static render and hydration in step; the client then reads the user agent.
  return useSyncExternalStore(
    noSubscribe,
    () => (/Android/i.test(navigator.userAgent) ? 'android' : 'ios'),
    () => 'ios',
  );
}

const noSubscribe = () => () => {};

/** Recordings are 390x844 (an iPhone 14 screen); the frame keeps that ratio below its status bar. */
const SCREEN_RATIO = 390 / 844;

type Spec = {
  band: number;
  bezel: number;
  outerRadius: number;
  statusHeight: number;
  timeSize: number;
  buttons: { side: 'left' | 'right'; top: number; height: number }[];
};

const SPECS: Record<DeviceKind, Spec> = {
  ios: {
    band: 3,
    bezel: 8,
    outerRadius: 56,
    statusHeight: 44,
    timeSize: 14,
    buttons: [
      { side: 'left', top: 104, height: 24 },
      { side: 'left', top: 150, height: 46 },
      { side: 'left', top: 206, height: 46 },
      { side: 'right', top: 170, height: 74 },
    ],
  },
  android: {
    band: 2,
    bezel: 6,
    outerRadius: 42,
    statusHeight: 32,
    timeSize: 12,
    buttons: [
      { side: 'right', top: 130, height: 64 },
      { side: 'right', top: 214, height: 38 },
    ],
  },
};

function SignalBars({ color }: { color: string }) {
  return (
    <View style={styles.signal}>
      {[4, 6, 8, 10].map((h) => (
        <View key={h} style={[styles.signalBar, { height: h, backgroundColor: color }]} />
      ))}
    </View>
  );
}

function Battery({ color }: { color: string }) {
  return (
    <View style={styles.batteryRow}>
      <View style={[styles.battery, { borderColor: color }]}>
        <View style={[styles.batteryFill, { backgroundColor: color }]} />
      </View>
      <View style={[styles.batteryNub, { backgroundColor: color }]} />
    </View>
  );
}

/**
 * A phone around the demo recording: metal band, black bezel, a status bar with the camera cutout
 * (Dynamic Island on iPhone, punch-hole on Android) and a home indicator over the bottom of the screen.
 */
export function DeviceFrame({
  kind,
  c,
  dark,
  style,
  children,
}: {
  kind: DeviceKind;
  c: AppColors;
  dark: boolean;
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
}) {
  const spec = SPECS[kind];
  const isIos = kind === 'ios';
  // Graphite titanium on the dark page, a silver band on the light page; the bezel is black either way.
  const metal = dark ? '#3b3d43' : '#c4c8cf';
  const screenRadius = spec.outerRadius - spec.band - spec.bezel;

  return (
    <View
      style={[
        styles.body,
        { borderRadius: spec.outerRadius, borderWidth: spec.band, borderColor: metal, padding: spec.bezel },
        style,
      ]}>
      {spec.buttons.map((b) => (
        <View
          key={`${b.side}${b.top}`}
          style={[
            styles.button,
            { top: b.top, height: b.height, backgroundColor: metal },
            b.side === 'left' ? { left: -spec.band - 3 } : { right: -spec.band - 3 },
          ]}
        />
      ))}
      <View style={[styles.screen, { borderRadius: screenRadius, backgroundColor: c.bg }]}>
        <View
          style={[styles.status, { height: spec.statusHeight, paddingHorizontal: isIos ? 26 : 18 }]}
          aria-hidden>
          <Text style={[styles.time, { color: c.text, fontSize: spec.timeSize }]}>9:41</Text>
          <View style={styles.statusIcons}>
            <SignalBars color={c.text} />
            <Battery color={c.text} />
          </View>
          <View style={[isIos ? styles.island : styles.punchHole, pointer.none]} />
        </View>
        <View style={styles.video}>{children}</View>
        <View
          aria-hidden
          style={[
            styles.homeIndicator,
            { width: isIos ? '36%' : '26%', backgroundColor: c.text },
            pointer.none,
          ]}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  body: { width: 340, maxWidth: '100%', backgroundColor: '#0b0b0c' },
  button: { position: 'absolute', width: 3, borderRadius: 2 },
  screen: { overflow: 'hidden' },
  status: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  time: { fontWeight: '600', letterSpacing: 0.2 },
  statusIcons: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  signal: { flexDirection: 'row', alignItems: 'flex-end', gap: 1.5 },
  signalBar: { width: 3, borderRadius: 1 },
  batteryRow: { flexDirection: 'row', alignItems: 'center', gap: 1 },
  battery: { width: 22, height: 11, borderWidth: 1, borderRadius: 3, padding: 1.5, opacity: 0.9 },
  batteryFill: { width: '78%', height: '100%', borderRadius: 1 },
  batteryNub: { width: 1.5, height: 4, borderRadius: 1, opacity: 0.6 },
  island: {
    position: 'absolute',
    top: 9,
    left: '50%',
    width: 96,
    height: 27,
    marginLeft: -48,
    borderRadius: 14,
    backgroundColor: '#000',
  },
  punchHole: {
    position: 'absolute',
    top: 9,
    left: '50%',
    width: 13,
    height: 13,
    marginLeft: -6.5,
    borderRadius: 7,
    backgroundColor: '#000',
  },
  video: { width: '100%', aspectRatio: SCREEN_RATIO },
  homeIndicator: {
    position: 'absolute',
    bottom: 7,
    alignSelf: 'center',
    height: 4,
    borderRadius: 2,
    opacity: 0.5,
  },
});

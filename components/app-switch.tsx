import { useAppColors } from '@/lib/app-theme';
import { Platform, Switch, type SwitchProps } from 'react-native';

type Props = Omit<SwitchProps, 'trackColor' | 'thumbColor' | 'ios_backgroundColor'>;

/**
 * Switch with the app's track/thumb colours. react-native-web paints its own teal thumb when
 * on unless `activeThumbColor` (web-only, not in RN's types) is set.
 */
export function AppSwitch(props: Props) {
  const c = useAppColors();
  const webThumb = Platform.OS === 'web' ? ({ activeThumbColor: c.switchThumb } as Partial<SwitchProps>) : {};
  return (
    <Switch
      {...props}
      {...webThumb}
      trackColor={{ false: c.switchTrackOff, true: c.switchTrackOn }}
      thumbColor={c.switchThumb}
      ios_backgroundColor={c.switchTrackOff}
    />
  );
}

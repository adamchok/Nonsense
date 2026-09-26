import { useAppColors } from '@/lib/app-theme';
import { Platform, Switch, type SwitchProps } from 'react-native';

type Props = Omit<SwitchProps, 'trackColor' | 'thumbColor' | 'ios_backgroundColor'>;

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

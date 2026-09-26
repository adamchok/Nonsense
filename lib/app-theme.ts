import { useResolvedColorScheme } from '@/lib/theme-context';

export interface AppColors {
  bg: string;
  card: string;
  cardAlt: string;
  inputBg: string;
  border: string;
  /** Text-field outline; meets WCAG 1.4.11 3:1 against card/inputBg. */
  inputBorder: string;
  borderAccent: string;
  borderDanger: string;
  borderBlue: string;
  borderAmber: string;

  text: string;
  textSecondary: string;
  textMuted: string;
  textHint: string;
  placeholder: string;

  accent: string;
  /** Accent used as text on card surfaces (accent itself is too dark in dark mode). */
  accentText: string;
  accentBg: string;
  accentBorder: string;
  accentBgDashed: string;
  /** Text/icons drawn on an `accent` fill (dark ink: gold is too light for white text). */
  onAccent: string;

  profit: string;
  loss: string;
  lossLight: string;
  warning: string;

  blue: string;
  blueBg: string;
  blueBorder: string;

  yellow: string;
  yellowBg: string;
  yellowBorder: string;

  green: string;

  badge: {
    host: string;
    you: string;
    cashedOut: string;
    live: string;
    liveBorder: string;
  };

  chipBg: string;
  chipBorder: string;
  chipText: string;

  friendChipBg: string;
  friendChipBorder: string;

  destructive: string;
  destructiveBg: string;

  avatarBg: string;
  avatarIcon: string;

  overlay: string;

  switchTrackOff: string;
  switchTrackOn: string;
  switchThumb: string;

  chipMinusBg: string;
  chipPlusBg: string;
  chipValueText: string;

  pressedRow: string;

  qrBg: string;
  qrFg: string;
}

const dark: AppColors = {
  bg: '#0f1115',
  card: '#1b1f27',
  cardAlt: '#12151b',
  inputBg: '#12151b',
  border: '#2f3542',
  inputBorder: '#64748b',
  borderAccent: '#6b5520',
  borderDanger: '#475569',
  borderBlue: '#3b82f6',
  borderAmber: '#78640d',

  text: '#fff',
  textSecondary: '#e2e8f0',
  textMuted: '#94a3b8',
  textHint: '#919fb4',
  placeholder: '#7a8393',

  accent: '#e0b24a',
  accentText: '#f5c451',
  accentBg: '#2e2612',
  accentBorder: '#6b5520',
  accentBgDashed: '#2e2612',
  onAccent: '#241a04',

  profit: '#34d399',
  loss: '#f87171',
  lossLight: '#f87171',
  warning: '#f59e0b',

  blue: '#60a5fa',
  blueBg: '#1e3a5f',
  blueBorder: '#1e3a5f',

  yellow: '#c7a306',
  yellowBg: '#473504',
  yellowBorder: '#473504',

  green: '#279c68',

  badge: {
    host: '#7a5d16',
    you: '#3961e3',
    cashedOut: '#475569',
    live: '#1f7a4d',
    liveBorder: '#1f7a4d',
  },

  chipBg: '#2a3140',
  chipBorder: '#475569',
  chipText: '#e2e8f0',

  friendChipBg: '#1a2a3d',
  friendChipBorder: '#1e3a5f',

  destructive: '#dc2626',
  destructiveBg: '#dc2626',

  avatarBg: '#243548',
  avatarIcon: '#94a3b8',

  overlay: 'rgba(0,0,0,0.65)',

  switchTrackOff: '#2f3542',
  switchTrackOn: '#b8892c',
  switchThumb: '#fff',

  chipMinusBg: '#3b1c1c',
  chipPlusBg: '#11352a',
  chipValueText: '#cdd3df',

  pressedRow: '#161a22',

  qrBg: '#1b1f27',
  qrFg: '#e2e8f0',
};

const light: AppColors = {
  bg: '#f1f5f9',
  card: '#ffffff',
  cardAlt: '#f8fafc',
  inputBg: '#f8fafc',
  border: '#e2e8f0',
  inputBorder: '#8391a7',
  borderAccent: '#b7791f',
  borderDanger: '#cbd5e1',
  borderBlue: '#3b82f6',
  borderAmber: '#d97706',

  text: '#0f172a',
  textSecondary: '#1e293b',
  textMuted: '#56667c',
  textHint: '#5f6f86',
  placeholder: '#64748b',

  accent: '#e0b24a',
  accentText: '#8a5a00',
  accentBg: '#fdf3dc',
  accentBorder: '#e9c77a',
  accentBgDashed: '#fdf3dc',
  onAccent: '#241a04',

  profit: '#047857',
  loss: '#dc2626',
  lossLight: '#dc2626',
  warning: '#b45309',

  blue: '#2563eb',
  blueBg: '#dbeafe',
  blueBorder: '#93c5fd',

  yellow: '#d97706',
  yellowBg: '#fef3c7',
  yellowBorder: '#fef3c7',

  green: '#279c68',

  badge: {
    host: '#8a5a00',
    you: '#2563eb',
    cashedOut: '#64748b',
    live: '#047857',
    liveBorder: '#047857',
  },

  chipBg: '#e2e8f0',
  chipBorder: '#cbd5e1',
  chipText: '#334155',

  friendChipBg: '#dbeafe',
  friendChipBorder: '#93c5fd',

  destructive: '#dc2626',
  destructiveBg: '#fef2f2',

  avatarBg: '#e2e8f0',
  avatarIcon: '#475569',

  overlay: 'rgba(0,0,0,0.35)',

  switchTrackOff: '#cbd5e1',
  switchTrackOn: '#b7791f',
  switchThumb: '#fff',

  chipMinusBg: '#fef2f2',
  chipPlusBg: '#d1fae5',
  chipValueText: '#475569',

  pressedRow: '#e2e8f0',

  qrBg: '#ffffff',
  qrFg: '#0f172a',
};

export function useAppColors(): AppColors {
  const scheme = useResolvedColorScheme();
  return scheme === 'dark' ? dark : light;
}

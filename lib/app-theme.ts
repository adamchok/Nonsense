import { useResolvedColorScheme } from '@/lib/theme-context';

export interface AppColors {
  bg: string;
  card: string;
  cardAlt: string;
  inputBg: string;
  border: string;
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
  accentBg: string;
  accentBorder: string;
  accentBgDashed: string;

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
  borderAccent: '#2d6a4f',
  borderDanger: '#475569',
  borderBlue: '#3b82f6',
  borderAmber: '#78640d',

  text: '#fff',
  textSecondary: '#e2e8f0',
  textMuted: '#94a3b8',
  textHint: '#64748b',
  placeholder: '#7a8393',

  accent: '#2d6a4f',
  accentBg: '#1a3a2a',
  accentBorder: '#2d6a4f',
  accentBgDashed: '#1a3a2a',

  profit: '#4ade80',
  loss: '#ef4444',
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
    host: '#2d6a4f',
    you: '#3961e3',
    cashedOut: '#475569',
    live: '#2d6a4f',
    liveBorder: '#2d6a4f',
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
  switchTrackOn: '#2d6a4f',
  switchThumb: '#fff',

  chipMinusBg: '#3b1c1c',
  chipPlusBg: '#1c3b2a',
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
  borderAccent: '#15803d',
  borderDanger: '#cbd5e1',
  borderBlue: '#3b82f6',
  borderAmber: '#d97706',

  text: '#0f172a',
  textSecondary: '#1e293b',
  textMuted: '#64748b',
  textHint: '#94a3b8',
  placeholder: '#94a3b8',

  accent: '#15803d',
  accentBg: '#dcfce7',
  accentBorder: '#86efac',
  accentBgDashed: '#dcfce7',

  profit: '#16a34a',
  loss: '#dc2626',
  lossLight: '#ef4444',
  warning: '#d97706',

  blue: '#2563eb',
  blueBg: '#dbeafe',
  blueBorder: '#93c5fd',

  yellow: '#d97706',
  yellowBg: '#fef3c7',
  yellowBorder: '#fef3c7',

  green: '#279c68',

  badge: {
    host: '#15803d',
    you: '#2563eb',
    cashedOut: '#94a3b8',
    live: '#16a34a',
    liveBorder: '#16a34a',
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
  switchTrackOn: '#15803d',
  switchThumb: '#fff',

  chipMinusBg: '#fef2f2',
  chipPlusBg: '#dcfce7',
  chipValueText: '#475569',

  pressedRow: '#e2e8f0',

  qrBg: '#ffffff',
  qrFg: '#0f172a',
};

export function useAppColors(): AppColors {
  const scheme = useResolvedColorScheme();
  return scheme === 'dark' ? dark : light;
}

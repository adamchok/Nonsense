/**
 * Phosphor icons are imported one file at a time (`phosphor-react-native/src/icons/<Name>`): Metro
 * does not tree-shake, so importing from the package root would ship every icon in every weight.
 */
import { ArrowCounterClockwiseIcon } from 'phosphor-react-native/src/icons/ArrowCounterClockwise';
import { MagnifyingGlassIcon } from 'phosphor-react-native/src/icons/MagnifyingGlass';
import { ArrowLeftIcon } from 'phosphor-react-native/src/icons/ArrowLeft';
import { ArrowRightIcon } from 'phosphor-react-native/src/icons/ArrowRight';
import { ArrowsClockwiseIcon } from 'phosphor-react-native/src/icons/ArrowsClockwise';
import { ArrowsLeftRightIcon } from 'phosphor-react-native/src/icons/ArrowsLeftRight';
import { CardsIcon } from 'phosphor-react-native/src/icons/Cards';
import { CaretDownIcon } from 'phosphor-react-native/src/icons/CaretDown';
import { CaretRightIcon } from 'phosphor-react-native/src/icons/CaretRight';
import { CaretUpIcon } from 'phosphor-react-native/src/icons/CaretUp';
import { ChartBarIcon } from 'phosphor-react-native/src/icons/ChartBar';
import { CheckIcon } from 'phosphor-react-native/src/icons/Check';
import { CheckCircleIcon } from 'phosphor-react-native/src/icons/CheckCircle';
import { CheckSquareIcon } from 'phosphor-react-native/src/icons/CheckSquare';
import { ClipboardTextIcon } from 'phosphor-react-native/src/icons/ClipboardText';
import { ClockIcon } from 'phosphor-react-native/src/icons/Clock';
import { ClockCounterClockwiseIcon } from 'phosphor-react-native/src/icons/ClockCounterClockwise';
import { CopyIcon } from 'phosphor-react-native/src/icons/Copy';
import { CrownIcon } from 'phosphor-react-native/src/icons/Crown';
import { CurrencyDollarIcon } from 'phosphor-react-native/src/icons/CurrencyDollar';
import { DeviceMobileIcon } from 'phosphor-react-native/src/icons/DeviceMobile';
import { DotsThreeVerticalIcon } from 'phosphor-react-native/src/icons/DotsThreeVertical';
import { FunnelIcon } from 'phosphor-react-native/src/icons/Funnel';
import { GearIcon } from 'phosphor-react-native/src/icons/Gear';
import { HouseIcon } from 'phosphor-react-native/src/icons/House';
import { ImagesIcon } from 'phosphor-react-native/src/icons/Images';
import { MapPinIcon } from 'phosphor-react-native/src/icons/MapPin';
import { MapPinLineIcon } from 'phosphor-react-native/src/icons/MapPinLine';
import { MicrophoneIcon } from 'phosphor-react-native/src/icons/Microphone';
import { MoneyIcon } from 'phosphor-react-native/src/icons/Money';
import { MoonIcon } from 'phosphor-react-native/src/icons/Moon';
import { PencilSimpleIcon } from 'phosphor-react-native/src/icons/PencilSimple';
import { PlusIcon } from 'phosphor-react-native/src/icons/Plus';
import { PokerChipIcon } from 'phosphor-react-native/src/icons/PokerChip';
import { QrCodeIcon } from 'phosphor-react-native/src/icons/QrCode';
import { RankingIcon } from 'phosphor-react-native/src/icons/Ranking';
import { ScanIcon } from 'phosphor-react-native/src/icons/Scan';
import { ShareNetworkIcon } from 'phosphor-react-native/src/icons/ShareNetwork';
import { SignOutIcon } from 'phosphor-react-native/src/icons/SignOut';
import { SlidersHorizontalIcon } from 'phosphor-react-native/src/icons/SlidersHorizontal';
import { SortDescendingIcon } from 'phosphor-react-native/src/icons/SortDescending';
import { SquareIcon } from 'phosphor-react-native/src/icons/Square';
import { StopIcon } from 'phosphor-react-native/src/icons/Stop';
import { SunIcon } from 'phosphor-react-native/src/icons/Sun';
import { TrashIcon } from 'phosphor-react-native/src/icons/Trash';
import { TrophyIcon } from 'phosphor-react-native/src/icons/Trophy';
import { UserIcon } from 'phosphor-react-native/src/icons/User';
import { UserPlusIcon } from 'phosphor-react-native/src/icons/UserPlus';
import { UsersIcon } from 'phosphor-react-native/src/icons/Users';
import { UsersThreeIcon } from 'phosphor-react-native/src/icons/UsersThree';
import { WalletIcon } from 'phosphor-react-native/src/icons/Wallet';
import { WhatsappLogoIcon } from 'phosphor-react-native/src/icons/WhatsappLogo';
import { XIcon } from 'phosphor-react-native/src/icons/X';
import type { Icon as PhosphorIcon } from 'phosphor-react-native';
import { Platform, type StyleProp, type ViewStyle } from 'react-native';

/**
 * App icon names: the Material / MaterialCommunity names the app used before moving to Phosphor,
 * kept so call sites read the same.
 */
const ICONS = {
  // Actions
  add: PlusIcon,
  close: XIcon,
  check: CheckIcon,
  edit: PencilSimpleIcon,
  'delete-outline': TrashIcon,
  refresh: ArrowsClockwiseIcon,
  replay: ArrowCounterClockwiseIcon,
  share: ShareNetworkIcon,
  'content-copy': CopyIcon,
  'more-vert': DotsThreeVerticalIcon,
  sort: SortDescendingIcon,
  'filter-alt': FunnelIcon,
  tune: SlidersHorizontalIcon,
  logout: SignOutIcon,
  mic: MicrophoneIcon,
  stop: StopIcon,
  // Navigation / disclosure
  home: HouseIcon,
  history: ClockCounterClockwiseIcon,
  settings: GearIcon,
  'chevron-right': CaretRightIcon,
  'expand-more': CaretDownIcon,
  'expand-less': CaretUpIcon,
  'arrow-left': ArrowLeftIcon,
  'arrow-right': ArrowRightIcon,
  'arrow-right-bold': ArrowRightIcon,
  // People
  person: UserIcon,
  'person-add': UserPlusIcon,
  people: UsersIcon,
  group: UsersIcon,
  'group-add': UsersThreeIcon,
  groups: UsersThreeIcon,
  search: MagnifyingGlassIcon,
  // Selection
  'check-box': CheckSquareIcon,
  'check-box-outline-blank': SquareIcon,
  'check-circle': CheckCircleIcon,
  'check-circle-outline': CheckCircleIcon,
  // Places
  place: MapPinIcon,
  'location-on': MapPinIcon,
  'map-marker-outline': MapPinIcon,
  'edit-location-alt': MapPinLineIcon,
  // Money / stats
  payments: MoneyIcon,
  'cash-multiple': MoneyIcon,
  'attach-money': CurrencyDollarIcon,
  'account-balance-wallet': WalletIcon,
  'bank-transfer': ArrowsLeftRightIcon,
  'poker-chip': PokerChipIcon,
  'bar-chart': ChartBarIcon,
  leaderboard: RankingIcon,
  'trophy-outline': TrophyIcon,
  'crown-outline': CrownIcon,
  // Misc
  style: CardsIcon,
  'clock-outline': ClockIcon,
  'clipboard-text-outline': ClipboardTextIcon,
  'qr-code': QrCodeIcon,
  'qr-code-scanner': ScanIcon,
  'photo-library': ImagesIcon,
  'phone-iphone': DeviceMobileIcon,
  'wb-sunny': SunIcon,
  'nights-stay': MoonIcon,
  whatsapp: WhatsappLogoIcon,
} satisfies Record<string, PhosphorIcon>;

export type IconName = keyof typeof ICONS;
export type IconWeight = 'regular' | 'bold' | 'fill';

/** Per-glyph weight overrides: Material glyphs that were solid (voice "stop") or heavy (bold arrow). */
const DEFAULT_WEIGHT: Partial<Record<IconName, IconWeight>> = {
  stop: 'fill',
  'check-circle': 'fill',
  'check-box': 'fill',
  'arrow-right-bold': 'bold',
};

export type IconProps = {
  name: IconName;
  size?: number;
  color?: string;
  weight?: IconWeight;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
  accessibilityElementsHidden?: boolean;
  importantForAccessibility?: 'auto' | 'yes' | 'no' | 'no-hide-descendants';
};

/** Crisp SVG icon (Phosphor) used everywhere instead of icon fonts. */
export function Icon({
  name,
  size = 24,
  color,
  weight,
  importantForAccessibility,
  accessibilityElementsHidden,
  ...rest
}: IconProps) {
  const Glyph = ICONS[name];
  const hidden =
    accessibilityElementsHidden === true ||
    importantForAccessibility === 'no' ||
    importantForAccessibility === 'no-hide-descendants';
  // On web these native-only a11y props would leak into the DOM as unknown attributes.
  const a11y =
    Platform.OS === 'web'
      ? hidden
        ? { 'aria-hidden': true }
        : {}
      : { importantForAccessibility, accessibilityElementsHidden };
  return <Glyph size={size} color={color} weight={weight ?? DEFAULT_WEIGHT[name] ?? 'regular'} {...a11y} {...rest} />;
}

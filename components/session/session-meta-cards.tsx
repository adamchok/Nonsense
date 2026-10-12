import { PressableScale } from '@/components/motion';
import { SessionAmountPrefix } from '@/components/session-amount-prefix';
import { useAppColors } from '@/lib/app-theme';
import {
  formatBlindChipStakeNumber,
  formatBlinds,
  formatBlindsChips,
  formatCompactCurrency,
} from '@/lib/currency-format';
import { sessionBlindsAreSet, type SessionView } from '@/lib/session-view';
import { Icon, type IconName } from '@/components/icon';
import type { ReactNode } from 'react';
import { radius, space } from '@/lib/spacing';
import { pressBg, text } from '@/lib/ui';
import { StyleSheet, Text, View } from 'react-native';

type Props = {
  session: SessionView | null;
  canEdit: boolean;
  onEditLocation: () => void;
  onEditBlinds: () => void;
  onEditChipValue: () => void;
};

export function SessionMetaCards({ session, canEdit, onEditLocation, onEditBlinds, onEditChipValue }: Props) {
  const location = session?.location?.trim() ? session.location : undefined;
  const dpc = session?.dollarsPerChip;
  const dpcText = dpc != null && Number.isFinite(dpc) ? formatCompactCurrency(dpc) : undefined;
  const blindsText = session
    ? session.amountUnit === 'chips'
      ? formatBlindsChips(session.smallBlind, session.bigBlind)
      : formatBlinds(session.smallBlind, session.bigBlind)
    : null;
  const blindsValue = session ? (
    <BlindsMetaLine session={session} />
  ) : (
    <MetaValue>Tap to add blinds</MetaValue>
  );

  return (
    <View style={styles.cards}>
      <View style={styles.row}>
        {canEdit ? (
          <>
            <MetaCard
              icon="place"
              label="Location"
              a11yValue={session?.location || 'not set'}
              onEdit={onEditLocation}>
              <MetaValue>{session?.location ? session.location : 'Tap to add location'}</MetaValue>
            </MetaCard>
            <MetaCard icon="payments" label="Blinds" a11yValue={blindsText ?? 'not set'} onEdit={onEditBlinds}>
              {blindsValue}
            </MetaCard>
          </>
        ) : (
          <>
            {location ? (
              <MetaCard icon="place" label="Location" a11yValue={location}>
                <MetaValue lines={2}>{location}</MetaValue>
              </MetaCard>
            ) : null}
            {session && sessionBlindsAreSet(session) ? (
              <MetaCard icon="payments" label="Blinds" a11yValue={blindsText ?? ''}>
                {blindsValue}
              </MetaCard>
            ) : null}
          </>
        )}
      </View>
      {session?.amountUnit === 'chips' ? (
        <MetaCard
          icon="attach-money"
          label="Dollars per chip"
          a11yValue={dpcText ?? 'not set'}
          onEdit={canEdit ? onEditChipValue : undefined}
          fullRow>
          <MetaValue>{dpcText ?? (canEdit ? 'Tap to set' : '—')}</MetaValue>
        </MetaCard>
      ) : null}
    </View>
  );
}

function MetaCard({
  icon,
  label,
  a11yValue,
  onEdit,
  fullRow,
  children,
}: {
  icon: IconName;
  label: string;
  a11yValue: string;
  onEdit?: () => void;
  fullRow?: boolean;
  children: ReactNode;
}) {
  const c = useAppColors();
  const cardStyle = [
    styles.card,
    fullRow && styles.fullRow,
    { backgroundColor: c.card, borderColor: c.border },
  ];
  const body = (
    <View style={styles.textBlock}>
      <View style={styles.labelRow}>
        <Icon name={icon} size={14} color={c.textHint} />
        <Text style={[text.label, { color: c.textHint }]}>{label}</Text>
      </View>
      {children}
    </View>
  );
  const spokenLabel = `${label.toLowerCase()}: ${a11yValue}`;
  if (!onEdit) {
    return (
      <View style={cardStyle} accessible accessibilityLabel={spokenLabel}>
        {body}
      </View>
    );
  }
  return (
    <PressableScale
      pressedScale={0.985}
      onPress={onEdit}
      style={(state) => [...cardStyle, pressBg(c, state)]}
      accessibilityRole="button"
      accessibilityLabel={spokenLabel}
      accessibilityHint={`Edit ${label.toLowerCase()}`}>
      {body}
      <Icon name="edit" size={18} color={c.textHint} />
    </PressableScale>
  );
}

function MetaValue({ children, lines = 1 }: { children: ReactNode; lines?: number }) {
  const c = useAppColors();
  return (
    <Text style={[text.rowTitle, { color: c.textSecondary }]} numberOfLines={lines}>
      {children}
    </Text>
  );
}

function BlindsMetaLine({ session }: { session: SessionView }) {
  const c = useAppColors();
  if (session.amountUnit === 'chips') {
    const s = session.smallBlind;
    const b = session.bigBlind;
    if (s == null || b == null || !Number.isFinite(s) || !Number.isFinite(b) || s <= 0 || b < s) {
      return <MetaValue>Tap to add blinds</MetaValue>;
    }
    return (
      <View style={styles.chipsBlindsRow}>
        <SessionAmountPrefix unit="chips" color={c.textSecondary} size={14} />
        <MetaValue>{formatBlindChipStakeNumber(s)}</MetaValue>
        <Text style={[text.rowTitle, { color: c.textSecondary }]}> / </Text>
        <SessionAmountPrefix unit="chips" color={c.textSecondary} size={14} />
        <MetaValue>{formatBlindChipStakeNumber(b)}</MetaValue>
      </View>
    );
  }
  return <MetaValue>{formatBlinds(session.smallBlind, session.bigBlind) ?? 'Tap to add blinds'}</MetaValue>;
}

const styles = StyleSheet.create({
  cards: {
    width: '100%',
    gap: space.sm,
  },
  row: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 8,
  },
  card: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: radius.md,
    borderWidth: 1,
    paddingVertical: 10,
    paddingHorizontal: 14,
    minHeight: 52,
  },
  fullRow: {
    flex: 0,
    alignSelf: 'stretch',
    width: '100%',
  },
  textBlock: {
    flex: 1,
    gap: 2,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  chipsBlindsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 4,
    minWidth: 0,
  },
});

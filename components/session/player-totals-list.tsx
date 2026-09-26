import { PlayerLedgerRow, type LedgerRowHandlers } from '@/components/session/player-ledger-row';
import { useAppColors } from '@/lib/app-theme';
import type { LedgerPlayer } from '@/lib/session-view';
import type { EarlyCashOut, SessionAmountUnit } from '@/types';
import { text as type, ui } from '@/lib/ui';
import { Animated, fadeIn, fadeOut, layoutTransition, listItemEntering } from '@/components/motion';
import { useState } from 'react';
import { View } from 'react-native';

type Props = LedgerRowHandlers & {
  players: LedgerPlayer[];
  earlyCashOutMap: ReadonlyMap<string, EarlyCashOut>;
  getAvatar: (playerId: string) => string;
  hostId: string | undefined;
  canAct: boolean;
  removingPlayerId: string | null;
  displayUnit: SessionAmountUnit;
  dollarsPerChip: number | undefined;
};

export function PlayerTotalsList({
  players,
  earlyCashOutMap,
  getAvatar,
  hostId,
  canAct,
  removingPlayerId,
  displayUnit,
  dollarsPerChip,
  ...handlers
}: Props) {
  const c = useAppColors();
  const [initialIds, setInitialIds] = useState<Set<string> | null>(null);
  if (initialIds === null && players.length > 0) {
    setInitialIds(new Set(players.map((p) => p.playerId)));
  }
  if (players.length === 0) {
    return (
      <Animated.Text entering={fadeIn} style={[type.body, { color: c.textMuted }]}>
        No buy-ins yet. Add a player above.
      </Animated.Text>
    );
  }
  return (
    <View style={[ui.card, { backgroundColor: c.card, borderColor: c.border }]}>
      {players.map((p, i) => (
        <Animated.View
          key={p.playerId}
          entering={listItemEntering(initialIds?.has(p.playerId) ? i : 0)}
          exiting={fadeOut}
          layout={layoutTransition}>
          <PlayerLedgerRow
            player={p}
            cashOut={earlyCashOutMap.get(p.playerId)}
            avatar={getAvatar(p.playerId)}
            isHostRow={p.playerId === hostId}
            canAct={canAct}
            isRemoving={removingPlayerId === p.playerId}
            showDivider={i > 0}
            displayUnit={displayUnit}
            dollarsPerChip={dollarsPerChip}
            {...handlers}
          />
        </Animated.View>
      ))}
    </View>
  );
}

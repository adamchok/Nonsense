import { PlayerLedgerRow, type LedgerRowHandlers } from '@/components/session/player-ledger-row';
import { useAppColors } from '@/lib/app-theme';
import type { LedgerPlayer } from '@/lib/session-view';
import type { EarlyCashOut, SessionAmountUnit } from '@/types';
import { Text, View } from 'react-native';

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

/**
 * Plain rows inside the screen's ScrollView. A home game has a dozen players at most, so
 * there is no inner scroller (a capped one trapped scrolling and hid rows at large font scale).
 */
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
  if (players.length === 0) {
    return <Text style={{ color: c.textMuted }}>No buy-ins yet. Add a player above.</Text>;
  }
  return (
    <View>
      {players.map((p) => (
        <PlayerLedgerRow
          key={p.playerId}
          player={p}
          cashOut={earlyCashOutMap.get(p.playerId)}
          avatar={getAvatar(p.playerId)}
          isHostRow={p.playerId === hostId}
          canAct={canAct}
          isRemoving={removingPlayerId === p.playerId}
          displayUnit={displayUnit}
          dollarsPerChip={dollarsPerChip}
          {...handlers}
        />
      ))}
    </View>
  );
}

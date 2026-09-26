import { useMemo } from 'react';
import * as Haptics from 'expo-haptics';

import { useVoiceCommand } from '@/hooks/use-voice-command';
import type { VoiceStatus } from '@/hooks/use-voice-command';
import { appAlert } from '@/lib/app-alert';
import { parseVoiceCommand } from '@/lib/voice-command';
import type { VoiceCommand, VoiceRosterEntry } from '@/lib/voice-command';
import type { SessionAmountUnit } from '@/types';

export type VoiceSeatedPlayer = {
  playerId: string;
  name: string;
  totalBuyIn: number;
  cashedOut: boolean;
};

export type VoiceSessionOptions = {
  isHost: boolean;
  sessionActive: boolean;
  amountUnit: SessionAmountUnit;
  roster: readonly VoiceRosterEntry[];
  findSeatedPlayer: (playerId: string) => VoiceSeatedPlayer | null;
  prefillBuyIn: (input: {
    playerId: string | null;
    playerName: string;
    amount: number;
    heardName?: string;
  }) => void;
  prefillCashOut: (player: VoiceSeatedPlayer, amount: number, heardName?: string) => void;
  prefillManualEntry: (input: { playerName: string; amount: string }) => void;
};

export type VoiceSession = {
  showMic: boolean;
  status: VoiceStatus;
  isListening: boolean;
  transcript: string;
  example: string;
  onMicPress: () => void;
  cancel: () => void;
};

function voiceHaptic(kind: 'start' | 'success' | 'warning') {
  if (process.env.EXPO_OS === 'web') return;
  if (kind === 'start') {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  } else if (kind === 'success') {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  } else {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
  }
}

function pickCommand(
  alternatives: readonly string[],
  roster: readonly VoiceRosterEntry[]
): { command: VoiceCommand; heard: string } {
  const parsed = alternatives.map((heard) => ({ command: parseVoiceCommand(heard, roster), heard }));
  const rosterHit = parsed.find(
    ({ command }) =>
      (command.kind === 'buyIn' && command.playerId !== null) || command.kind === 'cashOut'
  );
  const newPlayer = parsed.find(({ command }) => command.kind === 'buyIn');
  return rosterHit ?? newPlayer ?? parsed[0] ?? { command: parseVoiceCommand('', roster), heard: '' };
}

export function useVoiceSession(options: VoiceSessionOptions): VoiceSession {
  const {
    isHost,
    sessionActive,
    amountUnit,
    roster,
    findSeatedPlayer,
    prefillBuyIn,
    prefillCashOut,
    prefillManualEntry,
  } = options;

  const example =
    amountUnit === 'chips' ? 'Adam buys in for fifty chips' : 'Adam buys in for fifty';

  const contextualStrings = useMemo(
    () => [...roster.map((entry) => entry.name), 'buy in', 'buys in', 'rebuy', 'cash out', 'cashes out'],
    [roster]
  );

  function reportUnparsed(command: Extract<VoiceCommand, { kind: 'unparsed' }>, heard: string) {
    voiceHaptic('warning');
    const heardLine = heard ? `Heard: “${heard}”\n\n` : '';
    let body: string;
    if (command.reason === 'ambiguous-name') {
      body = `${heardLine}Did you mean ${(command.candidates ?? []).join(' or ')}?`;
    } else if (command.reason === 'negative-amount') {
      body = `${heardLine}Amounts can’t be negative. Say a plain amount.`;
    } else if (command.reason === 'unsupported-unit') {
      body = `${heardLine}Say a plain amount — big blinds aren’t supported.`;
    } else if (command.reason === 'empty') {
      body = 'Nothing was picked up. Try again a little closer to the mic.';
    } else {
      body = `${heardLine}Try “${example}”.`;
    }
    appAlert('Didn’t catch that', body, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Type it',
        onPress: () =>
          prefillManualEntry({
            playerName: command.playerName ?? '',
            amount: command.amount != null ? String(command.amount) : '',
          }),
      },
    ]);
  }

  function apply(command: VoiceCommand, heard: string) {
    if (!isHost) {
      appAlert('Host only', 'Only the host can add buy-ins.');
      return;
    }
    if (!sessionActive) return;

    if (command.kind === 'buyIn') {
      voiceHaptic('success');
      prefillBuyIn({
        playerId: command.playerId,
        playerName: command.playerName,
        amount: command.amount,
        heardName: command.heardName,
      });
      return;
    }

    if (command.kind === 'cashOut') {
      const player = findSeatedPlayer(command.playerId);
      if (!player) {
        appAlert('Not in this session', `${command.playerName} has no buy-ins yet.`);
        return;
      }
      if (player.cashedOut) {
        appAlert(`${player.name} already cashed out`, 'Buy them back in first.');
        return;
      }
      voiceHaptic('success');
      prefillCashOut(player, command.amount, command.heardName);
      return;
    }

    reportUnparsed(command, heard);
  }

  const voice = useVoiceCommand({
    contextualStrings,
    onTranscript: (alternatives) => {
      const { command, heard } = pickCommand(alternatives, roster);
      apply(command, heard);
    },
  });

  const isListening = voice.status === 'listening';

  return {
    showMic: voice.available && isHost && sessionActive,
    status: voice.status,
    isListening,
    transcript: voice.transcript,
    example,
    onMicPress: () => {
      if (isListening) {
        voice.stop();
        return;
      }
      voiceHaptic('start');
      voice.start();
    },
    cancel: voice.cancel,
  };
}

import { useMemo } from 'react';
import * as Haptics from 'expo-haptics';

import { useVoiceCommand } from '@/hooks/use-voice-command';
import type { VoiceStatus } from '@/hooks/use-voice-command';
import { appAlert } from '@/lib/app-alert';
import { parseVoiceCommand } from '@/lib/voice-command';
import type { VoiceCommand, VoiceRosterEntry } from '@/lib/voice-command';
import type { SessionAmountUnit } from '@/types';

/**
 * Turns a heard utterance into a pre-filled modal on the live-session screen.
 *
 * Nothing here writes to Firestore. Every path ends at one of the `prefill`
 * callbacks, which open the same editors a typed entry uses, so a misparse costs
 * the host a tap and nothing else.
 */

/** A player who already has buy-ins in the current session. */
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
  /** Seated players first, so they win name ties against friends who aren't playing. */
  roster: readonly VoiceRosterEntry[];
  findSeatedPlayer: (playerId: string) => VoiceSeatedPlayer | null;
  /** `playerId` is null when the name is not on the roster, i.e. a new guest. */
  prefillBuyIn: (input: { playerId: string | null; playerName: string; amount: number }) => void;
  prefillCashOut: (player: VoiceSeatedPlayer, amount: number) => void;
  /** Hand over to typing, carrying whatever was understood. Fields may be blank. */
  prefillManualEntry: (input: { playerName: string; amount: string }) => void;
};

export type VoiceSession = {
  /** False when the device has no recogniser, the viewer isn't the host, or the session is closed. */
  showMic: boolean;
  status: VoiceStatus;
  isListening: boolean;
  transcript: string;
  /** Spoken example, for the hint line and the accessibility hint. */
  example: string;
  onMicPress: () => void;
  cancel: () => void;
};

function voiceHaptic(kind: 'start' | 'success' | 'warning') {
  // Unlike the tab bar, this fires on Android too — voice input is used eyes-free.
  if (process.env.EXPO_OS === 'web') return;
  if (kind === 'start') {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  } else if (kind === 'success') {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  } else {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
  }
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

  // Biases the recogniser toward the names it is actually likely to hear.
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
      prefillCashOut(player, command.amount);
      return;
    }

    reportUnparsed(command, heard);
  }

  const voice = useVoiceCommand({
    contextualStrings,
    onTranscript: (heard) => apply(parseVoiceCommand(heard, roster), heard),
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

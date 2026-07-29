import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { useFocusEffect } from 'expo-router';

import { appAlert } from '@/lib/app-alert';

type SpeechPackage = typeof import('expo-speech-recognition');

/**
 * Loaded defensively rather than with a static import.
 *
 * expo-speech-recognition calls requireNativeModule() at module scope, which
 * throws on any build without the native module — Expo Go, most obviously. A
 * static import would take this whole route down with it (the screen would fail
 * to export a default and the route would vanish), so the failure is contained
 * here instead and simply reports the feature as unavailable.
 */
const speech: SpeechPackage | null = (() => {
  if (Platform.OS === 'web') return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('expo-speech-recognition') as SpeechPackage;
  } catch {
    return null;
  }
})();

const recogniser = speech?.ExpoSpeechRecognitionModule ?? null;

/**
 * Real subscriber when the native module exists, no-op otherwise. Which one is
 * chosen is fixed at module load, so the hook order never changes at runtime.
 */
const useSpeechEvent: SpeechPackage['useSpeechRecognitionEvent'] =
  speech?.useSpeechRecognitionEvent ?? (() => {});

export type VoiceStatus = 'idle' | 'starting' | 'listening';

export type UseVoiceCommand = {
  /** False when the device has no speech recogniser — the caller should render no mic at all. */
  available: boolean;
  status: VoiceStatus;
  /** Live interim text, for display only. Never parsed mid-flight. */
  transcript: string;
  /** Request permission if needed, then begin listening. */
  start: () => void;
  /** Finish listening and keep what was heard. */
  stop: () => void;
  /** Abandon this utterance entirely. */
  cancel: () => void;
};

/** Recogniser noise that just means "nothing was said" — not worth an alert. */
const SILENT_ERRORS = new Set(['aborted', 'no-speech', 'speech-timeout', 'interrupted']);

const ERROR_MESSAGES: Record<string, string> = {
  'not-allowed': 'Microphone and speech recognition access is required to add buy-ins by voice.',
  'service-not-allowed': 'Speech recognition is unavailable on this device.',
  'language-not-supported': 'Speech recognition is unavailable for this language.',
  network: 'Speech recognition needs a network connection right now.',
  busy: 'The recogniser is busy. Try again in a moment.',
  'audio-capture': 'Could not access the microphone.',
};

/** iOS degrades past roughly this many biasing phrases. */
const MAX_CONTEXTUAL_STRINGS = 100;

function detectAvailability(): boolean {
  if (!recogniser) return false;
  try {
    return recogniser.isRecognitionAvailable();
  } catch {
    return false;
  }
}

function abortQuietly() {
  try {
    recogniser?.abort();
  } catch {
    // Nothing to abort, or no recogniser on this build.
  }
}

/**
 * There is one native recogniser and `useSpeechEvent` subscribes to a module-global
 * emitter, so without this every mounted instance of the hook would react to
 * another instance's utterance. Whoever starts the recogniser owns the events until
 * it ends.
 */
let activeOwner: object | null = null;

function releaseOwnership(owner: object) {
  if (activeOwner === owner) activeOwner = null;
}

export function useVoiceCommand(options: {
  contextualStrings: readonly string[];
  onTranscript: (transcript: string) => void;
}): UseVoiceCommand {
  const { contextualStrings, onTranscript } = options;

  const [available] = useState(detectAvailability);
  const [status, setStatus] = useState<VoiceStatus>('idle');
  const [transcript, setTranscript] = useState('');

  // Mirrors `status` so event handlers and the start guard can read it without
  // being re-created on every transition.
  const statusRef = useRef<VoiceStatus>('idle');
  const applyStatus = useCallback((next: VoiceStatus) => {
    statusRef.current = next;
    setStatus(next);
  }, []);

  const finalRef = useRef('');
  const interimRef = useRef('');
  const cancelledRef = useRef(false);
  const errorRef = useRef<string | null>(null);

  // Stable per-instance identity used to claim the global recogniser events.
  const ownerRef = useRef({});
  const owns = useCallback(() => activeOwner === ownerRef.current, []);

  // Read through refs so a roster change never restarts an in-flight recognition,
  // and so the `start` callback keeps a stable identity.
  const onTranscriptRef = useRef(onTranscript);
  const contextualRef = useRef(contextualStrings);
  useEffect(() => {
    onTranscriptRef.current = onTranscript;
  }, [onTranscript]);
  useEffect(() => {
    contextualRef.current = contextualStrings;
  }, [contextualStrings]);

  useSpeechEvent('start', () => {
    if (!owns()) return;
    applyStatus('listening');
  });

  useSpeechEvent('result', (event) => {
    if (!owns()) return;
    const text = event.results[0]?.transcript ?? '';
    if (event.isFinal) {
      finalRef.current = text;
    } else if (text) {
      interimRef.current = text;
    }
    setTranscript(text);
  });

  useSpeechEvent('error', (event) => {
    if (!owns()) return;
    errorRef.current = event.error;
  });

  // Parsing happens here rather than on the final result: Android frequently ends
  // on a silence timeout without ever emitting isFinal, and opening a modal while
  // the recogniser still holds the audio session causes an audio-focus fight.
  useSpeechEvent('end', () => {
    if (!owns()) return;
    releaseOwnership(ownerRef.current);

    const wasCancelled = cancelledRef.current;
    const error = errorRef.current;
    const heard = (finalRef.current || interimRef.current).trim();

    cancelledRef.current = false;
    errorRef.current = null;
    finalRef.current = '';
    interimRef.current = '';
    applyStatus('idle');
    setTranscript('');

    if (wasCancelled) return;
    if (error && !SILENT_ERRORS.has(error)) {
      appAlert('Voice unavailable', ERROR_MESSAGES[error] ?? 'Could not process that. Try again.');
      return;
    }
    // A silent error yields an empty transcript, which the parser reports as
    // "didn't catch that" — the same path as genuinely unintelligible speech.
    onTranscriptRef.current(heard);
  });

  const start = useCallback(() => {
    // Guard on the ref, not on state: a second tap can land before React has
    // committed the 'starting' transition. A non-null owner means another instance
    // of this hook already holds the recogniser.
    if (!recogniser || !available || statusRef.current !== 'idle' || activeOwner !== null) return;
    activeOwner = ownerRef.current;
    applyStatus('starting');

    void (async () => {
      try {
        const current = await recogniser.getPermissionsAsync();
        const granted = current.granted
          ? true
          : (await recogniser.requestPermissionsAsync()).granted;
        if (!granted) {
          releaseOwnership(ownerRef.current);
          applyStatus('idle');
          appAlert(
            'Permission needed',
            'Microphone and speech recognition access is required to add buy-ins by voice.'
          );
          return;
        }

        cancelledRef.current = false;
        errorRef.current = null;
        finalRef.current = '';
        interimRef.current = '';
        setTranscript('');

        recogniser.start({
          lang: 'en-US',
          interimResults: true,
          continuous: false,
          maxAlternatives: 1,
          contextualStrings: contextualRef.current.slice(0, MAX_CONTEXTUAL_STRINGS),
          // Both of these are the library's documented fixes for short numeric
          // utterances, which is most of what gets said at a poker table.
          iosTaskHint: 'confirmation',
          androidIntentOptions: {
            EXTRA_LANGUAGE_MODEL: 'web_search',
            EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS: 1000,
          },
        });
      } catch (e) {
        releaseOwnership(ownerRef.current);
        applyStatus('idle');
        appAlert(
          'Voice unavailable',
          e instanceof Error ? e.message : 'Could not start voice input.'
        );
      }
    })();
  }, [available, applyStatus]);

  const stop = useCallback(() => {
    try {
      recogniser?.stop();
    } catch {
      // stop() only throws when the recogniser is not in a stoppable state, which
      // would otherwise strand the UI in 'listening' with no 'end' event coming.
      // Aborting still delivers what was heard: the transcript lives in the refs
      // above, and only cancel() sets the flag that suppresses it.
      abortQuietly();
    }
  }, []);

  const discard = useCallback(() => {
    cancelledRef.current = true;
    finalRef.current = '';
    interimRef.current = '';
    errorRef.current = null;
    releaseOwnership(ownerRef.current);
    abortQuietly();
  }, []);

  const cancel = useCallback(() => {
    discard();
    applyStatus('idle');
    setTranscript('');
  }, [discard, applyStatus]);

  useEffect(() => discard, [discard]);

  // Leaving the screen mid-utterance must not fire a command on the way out.
  useFocusEffect(useCallback(() => discard, [discard]));

  return { available, status, transcript, start, stop, cancel };
}

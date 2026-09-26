import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { useFocusEffect } from 'expo-router';

import { appAlert } from '@/lib/app-alert';

type SpeechPackage = typeof import('expo-speech-recognition');

const speech: SpeechPackage | null = (() => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('expo-speech-recognition') as SpeechPackage;
  } catch {
    return null;
  }
})();

const recogniser = speech?.ExpoSpeechRecognitionModule ?? null;

const useSpeechEvent: SpeechPackage['useSpeechRecognitionEvent'] =
  speech?.useSpeechRecognitionEvent ?? (() => {});

export type VoiceStatus = 'idle' | 'starting' | 'listening';

export type UseVoiceCommand = {
  available: boolean;
  status: VoiceStatus;
  transcript: string;
  start: () => void;
  stop: () => void;
  cancel: () => void;
};

const SILENT_ERRORS = new Set(['aborted', 'no-speech', 'speech-timeout', 'interrupted']);

const ERROR_MESSAGES: Record<string, string> = {
  'not-allowed': 'Microphone and speech recognition access is required to add buy-ins by voice.',
  'service-not-allowed': 'Speech recognition is unavailable on this device.',
  'language-not-supported': 'Speech recognition is unavailable for this language.',
  network: 'Speech recognition needs a network connection right now.',
  busy: 'The recogniser is busy. Try again in a moment.',
  'audio-capture': 'Could not access the microphone.',
};

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
  }
}

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

  const statusRef = useRef<VoiceStatus>('idle');
  const applyStatus = useCallback((next: VoiceStatus) => {
    statusRef.current = next;
    setStatus(next);
  }, []);

  const finalRef = useRef('');
  const interimRef = useRef('');
  const cancelledRef = useRef(false);
  const errorRef = useRef<string | null>(null);

  const ownerRef = useRef({});
  const owns = useCallback(() => activeOwner === ownerRef.current, []);

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
    onTranscriptRef.current(heard);
  });

  const start = useCallback(() => {
    if (!recogniser || !available || statusRef.current !== 'idle' || activeOwner !== null) return;
    activeOwner = ownerRef.current;
    applyStatus('starting');

    void (async () => {
      try {
        const granted =
          Platform.OS === 'web' ||
          (await recogniser.getPermissionsAsync()).granted ||
          (await recogniser.requestPermissionsAsync()).granted;
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

  useFocusEffect(useCallback(() => discard, [discard]));

  return { available, status, transcript, start, stop, cancel };
}

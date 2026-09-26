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

const MAX_ALTERNATIVES = 5;

const FALLBACK_LANG = 'en-US';

let recognitionLang = 'en-SG';

function alternativesOf(results: readonly { transcript: string }[]): string[] {
  const out: string[] = [];
  for (const result of results) {
    const text = result.transcript.trim();
    if (text && !out.includes(text)) out.push(text);
  }
  return out;
}

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
  onTranscript: (alternatives: readonly string[]) => void;
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

  const finalRef = useRef<string[]>([]);
  const interimRef = useRef<string[]>([]);
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
    const alternatives = alternativesOf(event.results);
    if (event.isFinal) {
      finalRef.current = alternatives;
    } else if (alternatives.length > 0) {
      interimRef.current = alternatives;
    }
    setTranscript(alternatives[0] ?? '');
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
    const heard = finalRef.current.length > 0 ? finalRef.current : interimRef.current;

    cancelledRef.current = false;
    errorRef.current = null;
    finalRef.current = [];
    interimRef.current = [];
    applyStatus('idle');
    setTranscript('');

    if (wasCancelled) return;
    if (error === 'language-not-supported' && recognitionLang !== FALLBACK_LANG) {
      recognitionLang = FALLBACK_LANG;
      startRef.current();
      return;
    }
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
        finalRef.current = [];
        interimRef.current = [];
        setTranscript('');

        recogniser.start({
          lang: recognitionLang,
          interimResults: true,
          continuous: false,
          maxAlternatives: MAX_ALTERNATIVES,
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

  const startRef = useRef(start);
  useEffect(() => {
    startRef.current = start;
  }, [start]);

  const stop = useCallback(() => {
    try {
      recogniser?.stop();
    } catch {
      abortQuietly();
    }
  }, []);

  const discard = useCallback(() => {
    cancelledRef.current = true;
    finalRef.current = [];
    interimRef.current = [];
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

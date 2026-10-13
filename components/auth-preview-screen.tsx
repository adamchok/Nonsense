import { SITE_URL } from '@/lib/legal-content';
import { useEvent, useEventListener } from 'expo';
import { VideoView, useVideoPlayer } from 'expo-video';
import { useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';

const PREVIEW_DARK = require('@/assets/images/sign-in-preview.jpg');
const PREVIEW_LIGHT = require('@/assets/images/sign-in-preview-light.jpg');
const CLIPS = ['live-session', 'settle-up', 'history', 'friends'] as const;

function ClipPlayer({ uri, onEnded }: { uri: string; onEnded: () => void }) {
  const player = useVideoPlayer(uri, (p) => {
    p.muted = true;
    p.play();
  });
  const { status } = useEvent(player, 'statusChange', { status: player.status });
  useEventListener(player, 'playToEnd', onEnded);
  return (
    <VideoView
      player={player}
      nativeControls={false}
      contentFit="cover"
      surfaceType="textureView"
      style={[styles.fill, { opacity: status === 'readyToPlay' ? 1 : 0 }]}
    />
  );
}

export function AuthPreviewScreen({ dark }: { dark: boolean }) {
  const reduceMotion = useReducedMotion();
  const [index, setIndex] = useState(0);
  const clip = dark ? CLIPS[index] : `${CLIPS[index]}-light`;

  return (
    <View style={styles.fill}>
      <Image source={dark ? PREVIEW_DARK : PREVIEW_LIGHT} style={styles.fill} resizeMode="cover" />
      {reduceMotion ? null : (
        <ClipPlayer
          key={clip}
          uri={`${SITE_URL}/media/${clip}.webm`}
          onEnded={() => setIndex((i) => (i + 1) % CLIPS.length)}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({ fill: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 } });

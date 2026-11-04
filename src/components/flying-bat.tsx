import { useEffect, useState } from 'react';
import { Animated, Easing, Platform } from 'react-native';

import { BatMark } from '@/components/bat-mark';
import { useReducedMotion } from '@/lib/use-reduced-motion';

export type FlyingBatProps = {
  size: number;
  tint?: string;
  /** False for a bat at home: it rests, and nothing moves. */
  flying?: boolean;
};

// Transforms run on the native side on a phone; the web build has no native
// side, and React Native Web would warn about being asked for one.
const NATIVE = Platform.OS !== 'web';

/** One wing beat, down and up, in milliseconds. */
export const WING_BEAT_MS = 520;
/** One slow rise and fall, in milliseconds. */
export const DRIFT_MS = 2800;

/**
 * A bat in the air: its wings beat, and it rises and falls a little as it
 * flies. Still for anyone who has asked their device for less motion, and for a
 * bat that is at home.
 *
 * Decoration only, so hidden from screen readers; whatever it shows is said in
 * words beside it.
 */
export function FlyingBat({ size, tint, flying = true }: FlyingBatProps) {
  const reduced = useReducedMotion();
  const moving = flying && !reduced;

  const [wings] = useState(() => new Animated.Value(0));
  const [drift] = useState(() => new Animated.Value(0));

  useEffect(() => {
    if (!moving) {
      wings.setValue(0);
      drift.setValue(0);
      return;
    }
    const swing = (value: Animated.Value, half: number, easing: (t: number) => number) =>
      Animated.loop(
        Animated.sequence([
          Animated.timing(value, { toValue: 1, duration: half, easing, useNativeDriver: NATIVE }),
          Animated.timing(value, { toValue: 0, duration: half, easing, useNativeDriver: NATIVE }),
        ]),
      );
    const beat = swing(wings, WING_BEAT_MS / 2, Easing.inOut(Easing.quad));
    const float = swing(drift, DRIFT_MS / 2, Easing.inOut(Easing.sin));
    beat.start();
    float.start();
    return () => {
      beat.stop();
      float.stop();
    };
  }, [moving, wings, drift]);

  return (
    <Animated.View
      testID="flying-bat"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{
        transform: [
          {
            translateY: drift.interpolate({
              inputRange: [0, 1],
              outputRange: [size * 0.04, -size * 0.06],
            }),
          },
          // Squashing the silhouette reads as the wings coming down.
          { scaleY: wings.interpolate({ inputRange: [0, 1], outputRange: [1, 0.78] }) },
        ],
      }}
    >
      <BatMark size={size} tint={tint} />
    </Animated.View>
  );
}

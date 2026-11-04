import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

/**
 * Whether the reader has asked their device for less motion: Reduce Motion on
 * iOS, Remove animations on Android, prefers-reduced-motion on the web.
 *
 * Calm until told otherwise - true until the device has answered - so that
 * someone who gets dizzy from movement never sees a frame of it. Follows the
 * setting while mounted.
 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(true);

  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled?.()
      .then((value) => {
        if (mounted) setReduced(value);
      })
      .catch(() => {});
    const subscription = AccessibilityInfo.addEventListener?.(
      'reduceMotionChanged',
      (value: boolean) => setReduced(value),
    );
    return () => {
      mounted = false;
      subscription?.remove();
    };
  }, []);

  return reduced;
}

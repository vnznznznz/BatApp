import { useSyncExternalStore } from 'react';
import { AccessibilityInfo } from 'react-native';

/**
 * Whether the reader has asked their device for less motion: Reduce Motion on
 * iOS, Remove animations on Android, prefers-reduced-motion on the web.
 *
 * Calm until told otherwise - true until the device has answered - so that
 * someone who gets dizzy from movement never sees a frame of it. Follows the
 * setting for as long as the app runs.
 *
 * One subscription for the whole app, not one per bat: React Native Web keys
 * its listeners by the handler's source text, so every bat's identical handler
 * shared one slot, and one bat landing removed another's - which then kept
 * beating its wings after the reader turned motion off. (Found in review.)
 */
let reduced = true;
let started = false;
const subscribers = new Set<() => void>();

function set(value: boolean) {
  reduced = value;
  subscribers.forEach((notify) => notify());
}

function subscribe(notify: () => void): () => void {
  subscribers.add(notify);
  if (!started) {
    started = true;
    AccessibilityInfo.isReduceMotionEnabled?.()
      .then(set)
      .catch(() => {});
    AccessibilityInfo.addEventListener?.('reduceMotionChanged', set);
  }
  return () => {
    subscribers.delete(notify);
  };
}

const current = () => reduced;
const calm = () => true;

export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, current, calm);
}

/** Forgets the device's answer, so each test starts as the app does. Tests only. */
export function resetReducedMotionForTests() {
  reduced = true;
  started = false;
  subscribers.clear();
}

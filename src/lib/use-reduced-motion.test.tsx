import { act, renderHook } from '@testing-library/react-native';
import { AccessibilityInfo } from 'react-native';

// Every other test runs with this mocked to "reduce motion" (see jest.setup.js);
// this one is about the real thing.
jest.unmock('@/lib/use-reduced-motion');
const { resetReducedMotionForTests, useReducedMotion } = jest.requireActual<
  typeof import('@/lib/use-reduced-motion')
>('@/lib/use-reduced-motion');

type Listener = (reduced: boolean) => void;

describe('useReducedMotion', () => {
  let listeners: Listener[];
  let subscribed: jest.SpyInstance;

  beforeEach(() => {
    resetReducedMotionForTests();
    listeners = [];
    subscribed = jest.spyOn(AccessibilityInfo, 'addEventListener').mockImplementation(((
      _event: string,
      listener: Listener,
    ) => {
      listeners.push(listener);
      return { remove: () => {} };
    }) as unknown as typeof AccessibilityInfo.addEventListener);
  });

  // React Native's own Jest setup makes AccessibilityInfo's methods mocks
  // already, which spyOn hands back calls and all: clear them as well.
  afterEach(() => {
    jest.restoreAllMocks();
    jest.clearAllMocks();
  });

  const deviceSays = (reduced: boolean) => act(async () => listeners.forEach((l) => l(reduced)));

  /** Until the device has answered, nothing moves: someone who asked for stillness never sees a frame. */
  it('is calm until the device says motion is fine', async () => {
    let answer!: (reduced: boolean) => void;
    jest
      .spyOn(AccessibilityInfo, 'isReduceMotionEnabled')
      .mockReturnValue(new Promise<boolean>((resolve) => (answer = resolve)));
    const { result } = await renderHook(() => useReducedMotion());

    expect(result.current).toBe(true);
    await act(async () => answer(false));
    expect(result.current).toBe(false);
  });

  it('stays calm for someone who asked for less motion', async () => {
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);

    const { result } = await renderHook(() => useReducedMotion());

    expect(result.current).toBe(true);
  });

  it('follows the setting when it changes', async () => {
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
    const { result } = await renderHook(() => useReducedMotion());
    expect(result.current).toBe(false);

    await deviceSays(true);

    expect(result.current).toBe(true);
  });

  /**
   * Three bats in the air, and one lands. React Native Web keyed listeners by
   * their source text, so when each bat had its own, the one that landed took
   * another's away, and that bat kept flapping after motion was turned off.
   * (Found in review.) Now the app listens once, for every bat.
   */
  it('keeps every other bat listening when one of them goes, listening to the device once', async () => {
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
    const landed = await renderHook(() => useReducedMotion());
    const stillFlying = await renderHook(() => useReducedMotion());
    const alsoFlying = await renderHook(() => useReducedMotion());

    await act(async () => landed.unmount());
    await deviceSays(true);

    expect(stillFlying.result.current).toBe(true);
    expect(alsoFlying.result.current).toBe(true);
    expect(subscribed).toHaveBeenCalledTimes(1);
  });
});

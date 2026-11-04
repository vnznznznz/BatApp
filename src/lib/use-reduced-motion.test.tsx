import { act, renderHook } from '@testing-library/react-native';
import { AccessibilityInfo } from 'react-native';

// Every other test runs with this mocked to "reduce motion" (see jest.setup.js);
// this one is about the real thing.
jest.unmock('@/lib/use-reduced-motion');
const { useReducedMotion } = jest.requireActual<typeof import('@/lib/use-reduced-motion')>(
  '@/lib/use-reduced-motion',
);

type Listener = (reduced: boolean) => void;

describe('useReducedMotion', () => {
  let listeners: Listener[];
  let removed: number;

  beforeEach(() => {
    listeners = [];
    removed = 0;
    jest.spyOn(AccessibilityInfo, 'addEventListener').mockImplementation(((
      _event: string,
      listener: Listener,
    ) => {
      listeners.push(listener);
      return { remove: () => removed++ };
    }) as unknown as typeof AccessibilityInfo.addEventListener);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

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

  it('follows the setting when it changes, and stops listening when unmounted', async () => {
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
    const { result, unmount } = await renderHook(() => useReducedMotion());
    expect(result.current).toBe(false);

    await act(async () => listeners.forEach((listener) => listener(true)));
    expect(result.current).toBe(true);

    await act(async () => unmount());
    expect(removed).toBe(1);
  });
});

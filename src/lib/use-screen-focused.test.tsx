import { act, renderHook } from '@testing-library/react-native';

import { useScreenFocused } from '@/lib/use-screen-focused';

/** The screen's focus, as the navigator would report it: an effect run on focus, cleaned up on blur. */
const mockFocus: { effect: (() => void | (() => void)) | null; cleanup: (() => void) | null } = {
  effect: null,
  cleanup: null,
};

jest.mock('expo-router', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  return {
    useFocusEffect: (effect: () => void | (() => void)) =>
      React.useEffect(() => {
        mockFocus.effect = effect;
        const cleanup = effect();
        mockFocus.cleanup = typeof cleanup === 'function' ? cleanup : null;
        return cleanup;
      }, [effect]),
  };
});

describe('useScreenFocused', () => {
  it('is true while the screen is in front, false once another covers it, and true again on return', async () => {
    const { result } = await renderHook(() => useScreenFocused());
    expect(result.current).toBe(true);

    await act(async () => mockFocus.cleanup?.());
    expect(result.current).toBe(false);

    await act(async () => {
      mockFocus.effect?.();
    });
    expect(result.current).toBe(true);
  });
});

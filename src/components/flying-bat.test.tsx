import { render, screen } from '@testing-library/react-native';
import { Animated } from 'react-native';

import { FlyingBat } from '@/components/flying-bat';
import { useReducedMotion } from '@/lib/use-reduced-motion';

const mockedReducedMotion = jest.mocked(useReducedMotion);

describe('FlyingBat', () => {
  let started: number;
  let stopped: number;

  beforeEach(() => {
    started = 0;
    stopped = 0;
    // The loops themselves are React Native's; what matters here is whether the
    // bat asks for them, and lets them go.
    jest.spyOn(Animated, 'loop').mockImplementation(
      () =>
        ({
          start: () => started++,
          stop: () => stopped++,
          reset: () => {},
        }) as unknown as Animated.CompositeAnimation,
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
    mockedReducedMotion.mockReturnValue(true);
  });

  it('beats its wings and drifts while it flies', async () => {
    mockedReducedMotion.mockReturnValue(false);

    await render(<FlyingBat size={52} />);

    expect(started).toBe(2);
  });

  /** Reduce Motion, Remove animations, prefers-reduced-motion: the bat holds still. */
  it('holds still for someone who has asked for less motion', async () => {
    mockedReducedMotion.mockReturnValue(true);

    await render(<FlyingBat size={52} />);

    expect(started).toBe(0);
  });

  it('rests when it is not flying', async () => {
    mockedReducedMotion.mockReturnValue(false);

    await render(<FlyingBat size={52} flying={false} />);

    expect(started).toBe(0);
  });

  it('stops moving when it leaves the screen', async () => {
    mockedReducedMotion.mockReturnValue(false);
    const { unmount } = await render(<FlyingBat size={52} />);

    await unmount();

    expect(stopped).toBe(2);
  });

  /** Whatever it shows is said in words beside it. */
  it('is hidden from screen readers', async () => {
    await render(<FlyingBat size={52} />);

    expect(screen.queryByRole('image')).toBeNull();
  });
});

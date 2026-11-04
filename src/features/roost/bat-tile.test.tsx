import { render, screen } from '@testing-library/react-native';
import { Animated, StyleSheet } from 'react-native';

import { BatTile } from '@/features/roost/bat-tile';
import type { Bat } from '@/features/roost/roost';
import { useReducedMotion } from '@/lib/use-reduced-motion';

const MINUTE = 60_000;
const NOW = new Date('2026-11-04T20:00:00Z').getTime();

const flying: Bat = {
  id: 'bat-1',
  slot: 1,
  status: 'flying',
  flight: {
    messageId: 'letter-1',
    recipient: { id: 'user-anna', username: 'anna', displayName: 'Anna Weber' },
    sentAt: new Date(NOW - 30 * MINUTE),
    deliverAt: new Date(NOW + 90 * MINUTE),
    distanceKm: 505,
  },
};

/** The bar and the flying bat are hidden from screen readers, so they are looked for as such. */
const HIDDEN = { includeHiddenElements: true };

const home: Bat = { id: 'bat-2', slot: 2, status: 'available', flight: null };

const fillWidth = () =>
  (
    StyleSheet.flatten(screen.getByTestId('flight-progress', HIDDEN).props.style) as {
      width: string;
    }
  ).width;

describe('BatTile', () => {
  it('shows how far a bat in the air has come', async () => {
    await render(<BatTile bat={flying} now={NOW} />);

    expect(fillWidth()).toBe('25%');
    expect(screen.getByTestId('flying-bat', HIDDEN)).toBeOnTheScreen();
  });

  it('fills up as the flight goes on, and stops full when it is due', async () => {
    const { rerender } = await render(<BatTile bat={flying} now={NOW + 30 * MINUTE} />);
    expect(fillWidth()).toBe('50%');

    await rerender(<BatTile bat={flying} now={NOW + 4 * 60 * MINUTE} />);
    expect(fillWidth()).toBe('100%');
  });

  it('shows a bat at home resting, with no flight to measure', async () => {
    await render(<BatTile bat={home} now={NOW} />);

    expect(screen.queryByTestId('flight-progress', HIDDEN)).toBeNull();
    expect(screen.queryByTestId('flying-bat', HIDDEN)).toBeNull();
  });

  /** The bar is drawing, not news: the tile already says when the bat lands. */
  it('keeps one description for a screen reader, with when the bat lands', async () => {
    await render(<BatTile bat={flying} now={NOW} />);

    expect(
      screen.getByRole('button', { name: 'Bat 1, flying to Anna Weber, lands in 1h 30m' }),
    ).toBeOnTheScreen();
  });

  /**
   * The roost stays mounted under every other screen. Its bats went on beating
   * their wings there, where nobody could see them. (Found in review.)
   */
  it('lets a flying bat rest while the roost is not the screen in front', async () => {
    jest.mocked(useReducedMotion).mockReturnValue(false);
    const loop = jest.spyOn(Animated, 'loop');

    const { rerender } = await render(<BatTile bat={flying} now={NOW} active={false} />);
    expect(loop).not.toHaveBeenCalled();

    await rerender(<BatTile bat={flying} now={NOW} active />);
    expect(loop).toHaveBeenCalled();

    loop.mockRestore();
    jest.mocked(useReducedMotion).mockReturnValue(true);
  });
});

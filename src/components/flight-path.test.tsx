import { fireEvent, render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { FlightPath, PATH_DOTS } from '@/components/flight-path';

/** Gives the sky its width, as a phone's layout would. */
async function layOut(width: number) {
  await fireEvent(screen.getByTestId('flight-path-sky'), 'layout', {
    nativeEvent: { layout: { x: 0, y: 0, width, height: 96 } },
  });
}

const batAt = () => {
  const style = StyleSheet.flatten(screen.getByTestId('flight-path-bat').props.style) as {
    left: number;
    top: number;
  };
  return { left: style.left, top: style.top };
};

describe('FlightPath', () => {
  it('is one image to a screen reader, saying how far the bat has come', async () => {
    await render(<FlightPath from="Berlin" to="Munich" progress={0.4} />);

    expect(
      screen.getByRole('image', { name: 'Bat 40% of the way from Berlin to Munich' }),
    ).toBeOnTheScreen();
  });

  it('names both cities', async () => {
    await render(<FlightPath from="Berlin" to="Munich" progress={0.4} />);

    expect(screen.getByText('Berlin')).toBeOnTheScreen();
    expect(screen.getByText('Munich')).toBeOnTheScreen();
  });

  it('draws nothing until it knows how wide it is', async () => {
    await render(<FlightPath from="Berlin" to="Munich" progress={0.4} />);

    expect(screen.queryByTestId('flight-path-bat')).toBeNull();
  });

  it('lights the path behind the bat and leaves it dim ahead', async () => {
    await render(<FlightPath from="Berlin" to="Munich" progress={0.5} />);
    await layOut(320);

    const flown = screen.getAllByTestId('path-dot-flown').length;
    const ahead = screen.getAllByTestId('path-dot-ahead').length;
    expect(flown + ahead).toBe(PATH_DOTS);
    expect(flown).toBe(Math.floor(0.5 * (PATH_DOTS - 1)) + 1);
  });

  it('puts the bat at the start as it leaves, at the top halfway, and at the end as it lands', async () => {
    const { rerender } = await render(<FlightPath from="Berlin" to="Munich" progress={0} />);
    await layOut(320);
    const leaving = batAt();

    await rerender(<FlightPath from="Berlin" to="Munich" progress={0.5} />);
    const halfway = batAt();

    await rerender(<FlightPath from="Berlin" to="Munich" progress={1} />);
    const landing = batAt();

    expect(halfway.left).toBeGreaterThan(leaving.left);
    expect(landing.left).toBeGreaterThan(halfway.left);
    expect(halfway.top).toBeLessThan(leaving.top);
    expect(landing.top).toBe(leaving.top);
  });

  it('keeps the bat on the path when the clock says more than all of it', async () => {
    await render(<FlightPath from="Berlin" to="Munich" progress={1.4} />);

    expect(
      screen.getByRole('image', { name: 'Bat arriving in Munich, from Berlin' }),
    ).toBeOnTheScreen();
  });
});

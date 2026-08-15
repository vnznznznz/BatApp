import { fireEvent, render, screen } from '@testing-library/react-native';

import { Button } from '@/components/button';

/**
 * `render` and `fireEvent` are both asynchronous in React Native Testing
 * Library 14 and must be awaited — without the await, `screen` is still the
 * placeholder and every query throws "`render` function has not been called".
 */
describe('Button', () => {
  it('renders its label and calls onPress', async () => {
    const onPress = jest.fn();
    await render(<Button label="Send" onPress={onPress} />);

    await fireEvent.press(screen.getByText('Send'));

    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('does not call onPress when disabled', async () => {
    const onPress = jest.fn();
    await render(<Button label="Send" disabled onPress={onPress} />);

    await fireEvent.press(screen.getByRole('button'));

    expect(onPress).not.toHaveBeenCalled();
  });

  /**
   * A send costs one of three bats. Letting a mid-request button fire twice is
   * exactly the double-send this app must never allow, so loading has to imply
   * disabled rather than merely looking busy.
   */
  it('does not call onPress while loading', async () => {
    const onPress = jest.fn();
    await render(<Button label="Send" loading onPress={onPress} />);

    await fireEvent.press(screen.getByRole('button'));

    expect(onPress).not.toHaveBeenCalled();
  });

  it('reports disabled and busy state to assistive technology', async () => {
    await render(<Button label="Send" loading onPress={jest.fn()} />);

    expect(screen.getByRole('button')).toBeDisabled();
    expect(screen.getByRole('button')).toBeBusy();
  });

  it('keeps the label mounted while loading so the button does not resize', async () => {
    await render(<Button label="Send" loading onPress={jest.fn()} />);

    expect(screen.getByText('Send')).toBeOnTheScreen();
  });
});

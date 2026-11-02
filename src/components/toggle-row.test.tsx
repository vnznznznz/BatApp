import { fireEvent, render, screen } from '@testing-library/react-native';

import { ToggleRow } from '@/components/toggle-row';

const LABEL = 'Also block @ben';
const HINT = 'Ends your friendship, hides their letters from you, and stops them asking again.';

const theSwitch = () => screen.getByRole('switch', { name: LABEL });

/**
 * Turns the switch as a finger would. The platform's switch reports the new
 * value as a change event, and React Native's Switch hands it on from there.
 *
 * Not `fireEvent(..., 'valueChange')`: that looks for an `onValueChange` prop
 * up the tree, finds this row's own, and so passes even when the row never
 * gives it to the switch.
 */
const turn = async (value: boolean) =>
  await fireEvent(theSwitch(), 'change', { nativeEvent: { value } });

describe('ToggleRow', () => {
  it.each([
    ['on', true],
    ['off', false],
  ])('is a switch named by its label, and %s while its value is %s', async (_, value) => {
    await render(<ToggleRow label={LABEL} value={value} onValueChange={jest.fn()} />);

    expect(screen.getByRole('switch', { name: LABEL, checked: value })).toBeOnTheScreen();
  });

  it('shows the new state once the screen changes its value', async () => {
    const { rerender } = await render(<ToggleRow label={LABEL} value onValueChange={jest.fn()} />);
    expect(theSwitch()).toBeChecked();

    await rerender(<ToggleRow label={LABEL} value={false} onValueChange={jest.fn()} />);

    expect(theSwitch()).not.toBeChecked();
  });

  /**
   * A screen reader on the switch hears what turning it on does, as a sighted
   * reader sees it beneath the label.
   */
  it('shows its label and hint, and gives the hint to the switch', async () => {
    await render(<ToggleRow label={LABEL} hint={HINT} value onValueChange={jest.fn()} />);

    expect(screen.getByText(LABEL)).toBeOnTheScreen();
    expect(screen.getByText(HINT)).toBeOnTheScreen();
    expect(theSwitch().props.accessibilityHint).toBe(HINT);
  });

  it('shows no hint, and gives none, when it has none', async () => {
    await render(<ToggleRow label={LABEL} value onValueChange={jest.fn()} />);

    expect(screen.queryByText(HINT)).toBeNull();
    expect(theSwitch().props.accessibilityHint).toBeUndefined();
  });

  it.each([
    ['off', true, false],
    ['on', false, true],
  ])('asks for the new value when it is turned %s', async (_, from, to) => {
    const onValueChange = jest.fn();
    await render(<ToggleRow label={LABEL} value={from} onValueChange={onValueChange} />);
    expect(onValueChange).not.toHaveBeenCalled();

    await turn(to);

    expect(onValueChange).toHaveBeenCalledTimes(1);
    expect(onValueChange).toHaveBeenCalledWith(to);
  });

  /**
   * What a disabled switch does is the platform's own: it takes no touches,
   * and iOS reads its enabled state from the native control. The test renderer
   * simulates neither - a change fired at it arrives all the same - so what is
   * checked here is that the setting reaches the platform's switch, and leaves
   * it again once lifted, as when the report screen has finished sending.
   */
  it('hands disabled to the platform’s switch, and takes it back when lifted', async () => {
    const { rerender } = await render(
      <ToggleRow label={LABEL} value onValueChange={jest.fn()} disabled />,
    );
    expect(theSwitch()).toHaveProp('disabled', true);

    await rerender(<ToggleRow label={LABEL} value onValueChange={jest.fn()} disabled={false} />);

    expect(theSwitch()).not.toHaveProp('disabled', true);
  });

  it('is enabled unless it is told otherwise', async () => {
    await render(<ToggleRow label={LABEL} value onValueChange={jest.fn()} />);

    expect(theSwitch()).not.toHaveProp('disabled', true);
  });
});

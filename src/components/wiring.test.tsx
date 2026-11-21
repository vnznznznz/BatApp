import { render, screen, userEvent } from '@testing-library/react-native';
import { useState } from 'react';
import * as ReactNative from 'react-native';

import { Button } from '@/components/button';
import { ChoiceList } from '@/components/choice-list';
import { ListRow } from '@/components/list-row';
import { SegmentedControl } from '@/components/segmented-control';
import { TextField } from '@/components/text-field';
import { BatTile } from '@/features/roost/bat-tile';
import type { Bat } from '@/features/roost/roost';

/**
 * Whether a press, or a word typed, gets through the app's own controls to the
 * screen that is listening.
 *
 * Every screen test presses with `fireEvent`, which does not touch the native
 * control: it looks up the tree for a prop named `onPress` or `onChangeText`
 * and calls the first one it finds - and the first one it finds is on the
 * app's own wrapper, a Button, a ListRow, a TextField. A wrapper that stopped
 * handing its handler on to React Native's Pressable or TextInput would leave
 * every button in the app doing nothing, and every one of those tests green.
 *
 * `userEvent` delivers the touch, and each keystroke, to the native control
 * itself, as a finger does. So here only what reaches the control counts. (The
 * switch of a ToggleRow has its own test for this, in toggle-row.test.tsx.)
 */

const user = userEvent.setup();

/**
 * The reader's text size. React Native's test environment reports a font scale
 * of 2 unless told otherwise - large text - and a row with actions lays itself
 * out differently from 1.2 up.
 */
function withTextScale(fontScale: number) {
  jest
    .spyOn(ReactNative.Dimensions, 'get')
    .mockReturnValue({ width: 390, height: 844, scale: 3, fontScale });
}

afterEach(() => {
  jest.restoreAllMocks();
});

describe('a press on the control', () => {
  it('reaches the screen through a Button', async () => {
    const onPress = jest.fn();
    await render(<Button label="Send by bat" onPress={onPress} />);

    await user.press(screen.getByRole('button', { name: 'Send by bat' }));

    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('reaches the screen through a row that opens something', async () => {
    const onPress = jest.fn();
    await render(<ListRow title="Letters" subtitle="2 new" onPress={onPress} />);

    await user.press(screen.getByRole('button', { name: /Letters/ }));

    expect(onPress).toHaveBeenCalledTimes(1);
  });

  /**
   * A row with actions makes only its text the button that opens it, beside
   * the actions; at a large text size the actions move below the text. Both
   * ways, each press reaches its own handler and only that one.
   */
  describe.each([
    ['at an ordinary text size', 1],
    ['at a large text size', 1.8],
  ])('reaches the screen through a row with actions, %s', (_, fontScale) => {
    /** A friend request, as the Friends screen shows one: open it, or answer it. */
    async function renderRequest() {
      const open = jest.fn();
      const accept = jest.fn();
      const decline = jest.fn();
      await render(
        <ListRow
          title="Carla Brandt"
          subtitle="@carla"
          onPress={open}
          actions={
            <>
              <Button label="Accept" size="compact" onPress={accept} />
              <Button label="Decline" size="compact" variant="ghost" onPress={decline} />
            </>
          }
        />,
      );
      return { open, accept, decline };
    }

    beforeEach(() => {
      withTextScale(fontScale);
    });

    it('from its text', async () => {
      const { open, accept, decline } = await renderRequest();

      await user.press(screen.getByRole('button', { name: /Carla Brandt/ }));

      expect(open).toHaveBeenCalledTimes(1);
      expect(accept).not.toHaveBeenCalled();
      expect(decline).not.toHaveBeenCalled();
    });

    it.each(['Accept', 'Decline'])('from its action %s', async (name) => {
      const { open, accept, decline } = await renderRequest();

      await user.press(screen.getByRole('button', { name }));

      expect(accept).toHaveBeenCalledTimes(name === 'Accept' ? 1 : 0);
      expect(decline).toHaveBeenCalledTimes(name === 'Decline' ? 1 : 0);
      expect(open).not.toHaveBeenCalled();
    });
  });

  it.each<[string, Bat, string]>([
    ['at home', { id: 'bat-2', slot: 2, status: 'available', flight: null }, 'Bat 2, at home'],
    [
      'in the air',
      {
        id: 'bat-1',
        slot: 1,
        status: 'flying',
        flight: {
          messageId: 'letter-1',
          recipient: { id: 'user-anna', username: 'anna', displayName: 'Anna Weber' },
          sentAt: new Date('2026-11-04T19:30:00Z'),
          deliverAt: new Date('2026-11-04T21:30:00Z'),
          distanceKm: 505,
        },
      },
      'Bat 1, flying to Anna Weber, lands in 1h 30m',
    ],
  ])('reaches the screen through the tile of a bat %s', async (_, bat, name) => {
    const onPress = jest.fn();
    await render(
      <BatTile bat={bat} now={new Date('2026-11-04T20:00:00Z').getTime()} onPress={onPress} />,
    );

    await user.press(screen.getByRole('button', { name }));

    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('answers with the value of the choice pressed in a ChoiceList', async () => {
    const onChange = jest.fn();
    await render(
      <ChoiceList
        label="What is wrong?"
        choices={[
          { value: 'spam', label: 'Spam or a scam' },
          { value: 'other', label: 'Something else' },
        ]}
        value={null}
        onChange={onChange}
      />,
    );

    await user.press(screen.getByRole('radio', { name: 'Something else' }));

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith('other');
  });

  it('answers with the value of the segment pressed in a SegmentedControl', async () => {
    const onChange = jest.fn();
    await render(
      <SegmentedControl
        segments={[
          { value: 'received', label: 'Received' },
          { value: 'sent', label: 'Sent' },
        ]}
        value="received"
        onChange={onChange}
      />,
    );

    await user.press(screen.getByRole('tab', { name: 'Sent' }));

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith('sent');
  });
});

describe('typing into a TextField', () => {
  /** A field as a screen holds it: what it shows is what the screen was told. */
  function Field(props: { onSubmitEditing?: () => void }) {
    const [value, setValue] = useState('');
    return <TextField label="Username" value={value} onChangeText={setValue} {...props} />;
  }

  it('reaches the screen, letter by letter', async () => {
    await render(<Field />);

    await user.type(screen.getByLabelText('Username'), 'anna');

    expect(screen.getByLabelText('Username')).toHaveDisplayValue('anna');
  });

  /** The forms are sent from the keyboard's own return key as well as by their button. */
  it('sends the keyboard’s return key on to the screen', async () => {
    const onSubmitEditing = jest.fn();
    await render(<Field onSubmitEditing={onSubmitEditing} />);

    await user.type(screen.getByLabelText('Username'), 'anna', { submitEditing: true });

    expect(onSubmitEditing).toHaveBeenCalledTimes(1);
  });

  /** The field draws its own focus ring, and still tells a screen that asks. */
  it('tells the screen when it gains and loses focus', async () => {
    const onFocus = jest.fn();
    const onBlur = jest.fn();
    await render(
      <TextField
        label="Username"
        value=""
        onChangeText={jest.fn()}
        onFocus={onFocus}
        onBlur={onBlur}
      />,
    );

    await user.type(screen.getByLabelText('Username'), 'a');

    expect(onFocus).toHaveBeenCalledTimes(1);
    expect(onBlur).toHaveBeenCalledTimes(1);
  });
});

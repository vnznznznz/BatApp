import { fireEvent, render, screen, within } from '@testing-library/react-native';
import { useState } from 'react';

import { ChoiceList, type Choice } from '@/components/choice-list';

type Reason = 'spam' | 'harassment' | 'other';

/** Three of the report screen's answers, in the order it offers them. */
const CHOICES: readonly Choice<Reason>[] = [
  { value: 'spam', label: 'Spam or a scam' },
  { value: 'harassment', label: 'Harassment or bullying' },
  { value: 'other', label: 'Something else' },
];

const LABEL = 'What is wrong?';
const ERROR = 'Choose what is wrong first.';

const radio = (name: string) => screen.getByRole('radio', { name });

/** The list as a screen holds it: the answer is whatever was pressed last. */
function Chooser() {
  const [value, setValue] = useState<Reason | null>(null);
  return <ChoiceList label={LABEL} choices={CHOICES} value={value} onChange={setValue} />;
}

describe('ChoiceList', () => {
  /**
   * The group is a container a screen reader moves through, not an element it
   * stops on: made one, it would swallow the radio buttons inside it on iOS.
   * So it is found by the label it carries rather than by its role.
   */
  it('groups its choices as radio buttons, in a radio group named by its label', async () => {
    await render(<ChoiceList label={LABEL} choices={CHOICES} value={null} onChange={jest.fn()} />);

    const group = screen.getByLabelText(LABEL);
    expect(group.props.role ?? group.props.accessibilityRole).toBe('radiogroup');
    expect(within(group).getAllByRole('radio')).toHaveLength(3);
    expect(within(group).getByRole('radio', { name: 'Harassment or bullying' })).toBeOnTheScreen();
  });

  it('shows each choice in its words, in the order it is given them', async () => {
    await render(<ChoiceList label={LABEL} choices={CHOICES} value={null} onChange={jest.fn()} />);

    expect(screen.getAllByRole('radio').map((choice) => choice.props.accessibilityLabel)).toEqual([
      'Spam or a scam',
      'Harassment or bullying',
      'Something else',
    ]);
    for (const { label } of CHOICES) {
      expect(screen.getByText(label)).toBeOnTheScreen();
    }
  });

  /** VoiceOver does not read a group's name; the heading is how it hears the question. */
  it('shows its label as a heading above the choices', async () => {
    await render(<ChoiceList label={LABEL} choices={CHOICES} value={null} onChange={jest.fn()} />);

    expect(screen.getByRole('header', { name: LABEL })).toBeOnTheScreen();
  });

  /**
   * There is no default answer. Each choice still says it is unchecked, rather
   * than nothing at all, so a screen reader can tell that none is chosen yet.
   */
  it('has every choice unchecked until something is chosen', async () => {
    await render(<ChoiceList label={LABEL} choices={CHOICES} value={null} onChange={jest.fn()} />);

    expect(screen.getAllByRole('radio', { checked: false })).toHaveLength(3);
    expect(screen.queryAllByRole('radio', { checked: true })).toHaveLength(0);
  });

  it('marks the chosen answer, and only that one, as checked', async () => {
    await render(
      <ChoiceList label={LABEL} choices={CHOICES} value="harassment" onChange={jest.fn()} />,
    );

    expect(radio('Harassment or bullying')).toBeChecked();
    expect(radio('Spam or a scam')).not.toBeChecked();
    expect(radio('Something else')).not.toBeChecked();
  });

  /** The words are for people; the value is what the database records. */
  it('answers with the value of the choice pressed, not its words', async () => {
    const onChange = jest.fn();
    await render(<ChoiceList label={LABEL} choices={CHOICES} value={null} onChange={onChange} />);

    await fireEvent.press(radio('Harassment or bullying'));

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith('harassment');
  });

  /** A radio button, unlike a checkbox, is not undone by pressing it a second time. */
  it('moves the check to the answer pressed, and keeps it there when it is pressed again', async () => {
    await render(<Chooser />);

    await fireEvent.press(radio('Spam or a scam'));
    await fireEvent.press(radio('Something else'));

    expect(radio('Something else')).toBeChecked();
    expect(radio('Spam or a scam')).not.toBeChecked();

    await fireEvent.press(radio('Something else'));

    expect(radio('Something else')).toBeChecked();
    expect(screen.getAllByRole('radio', { checked: true })).toHaveLength(1);
  });

  it('shows an error beneath the choices, and takes it away once it is cleared', async () => {
    const { rerender } = await render(
      <ChoiceList
        label={LABEL}
        choices={CHOICES}
        value={null}
        onChange={jest.fn()}
        error={ERROR}
      />,
    );
    expect(screen.getByText(ERROR)).toBeOnTheScreen();

    await rerender(
      <ChoiceList label={LABEL} choices={CHOICES} value="spam" onChange={jest.fn()} error={null} />,
    );

    expect(screen.queryByText(ERROR)).toBeNull();
  });

  /**
   * TalkBack reads a polite live region out when it changes. VoiceOver has no
   * live regions, so on iOS it is the screen that sets the error that says it
   * aloud - the report screen does.
   */
  it('marks its error for TalkBack to read out', async () => {
    await render(
      <ChoiceList
        label={LABEL}
        choices={CHOICES}
        value={null}
        onChange={jest.fn()}
        error={ERROR}
      />,
    );

    expect(screen.getByText(ERROR)).toHaveProp('accessibilityLiveRegion', 'polite');
  });

  /** Each answer is a whole row to tap, at least as tall as the platforms ask a target to be. */
  it('gives every choice a touch target the platforms ask for', async () => {
    await render(<ChoiceList label={LABEL} choices={CHOICES} value="spam" onChange={jest.fn()} />);

    for (const choice of screen.getAllByRole('radio')) {
      expect(choice).toHaveStyle({ minHeight: 48 });
    }
  });
});

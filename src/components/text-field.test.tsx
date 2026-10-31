import { render, screen } from '@testing-library/react-native';
import { AccessibilityInfo } from 'react-native';

import { TextField } from '@/components/text-field';

describe('TextField', () => {
  /**
   * An error appears under the field while focus is still on the button that
   * caused it; colour alone tells a screen reader user nothing.
   */
  it('says an error aloud when it appears', async () => {
    const announce = jest
      .spyOn(AccessibilityInfo, 'announceForAccessibility')
      .mockImplementation(() => {});
    const { rerender } = await render(<TextField label="Username" value="an" />);
    expect(announce).not.toHaveBeenCalled();

    await rerender(
      <TextField label="Username" value="an" error="Usernames need at least 3 characters." />,
    );

    expect(announce).toHaveBeenCalledWith('Username: Usernames need at least 3 characters.');
    announce.mockRestore();
  });

  it('gives the error, rather than the hint, to a screen reader returning to the field', async () => {
    await render(
      <TextField label="Username" value="an" hint="How friends find you." error="Too short." />,
    );

    expect(screen.getByLabelText('Username').props.accessibilityHint).toBe('Too short.');
  });

  it('gives the hint when there is no error', async () => {
    await render(<TextField label="Username" value="anna" hint="How friends find you." />);

    expect(screen.getByLabelText('Username').props.accessibilityHint).toBe('How friends find you.');
  });

  /** The letter field passes a hint of its own; an error must still win. */
  it('gives the error priority over a hint passed in by the screen', async () => {
    await render(
      <TextField
        label="Your letter"
        value=""
        accessibilityHint="Up to 2000 characters."
        error="Write something first."
      />,
    );

    expect(screen.getByLabelText('Your letter').props.accessibilityHint).toBe(
      'Write something first.',
    );
  });
});

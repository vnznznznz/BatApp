import { render, screen } from '@testing-library/react-native';
import { createRef } from 'react';
import { AccessibilityInfo, Platform, TextInput } from 'react-native';

import { TextField } from '@/components/text-field';
import { Colors } from '@/constants/theme';

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

describe('TextField colours', () => {
  const DEFAULT_OS = Platform.OS;

  afterEach(() => {
    Platform.OS = DEFAULT_OS;
  });

  /** Red, green, blue and opacity (0 to 1) of a colour given as #RRGGBB, #RRGGBBAA or rgba(). */
  function channels(color: unknown): [number, number, number, number] {
    if (typeof color !== 'string') throw new Error(`Not a colour: ${String(color)}`);
    const hex = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})?$/i.exec(color);
    if (hex) {
      const [r = '', g = '', b = '', a = 'ff'] = hex.slice(1);
      return [parseInt(r, 16), parseInt(g, 16), parseInt(b, 16), parseInt(a, 16) / 255];
    }
    const rgba = /^rgba?\(\s*(\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\s*\)$/.exec(color);
    if (rgba) {
      const [r = '', g = '', b = '', a = '1'] = rgba.slice(1);
      return [Number(r), Number(g), Number(b), Number(a)];
    }
    throw new Error(`Not a colour this test reads: ${color}`);
  }

  /**
   * Android draws the selection colour as the highlight behind selected text,
   * exactly as given, and leaves the text's own colour alone: the opaque
   * accent made a solid cream block with near-white words on it.
   */
  it('on Android, highlights a selection see-through, with the caret and handles in the accent', async () => {
    Platform.OS = 'android';
    await render(<TextField label="Your letter" value="Dear Ben," multiline />);
    const field = screen.getByLabelText('Your letter');

    const [r, g, b, opacity] = channels(field.props.selectionColor);
    expect([r, g, b]).toEqual(channels(Colors.accent).slice(0, 3));
    expect(opacity).toBeCloseTo(0.3, 1);
    // Given no colour of their own, the caret and the handles would take the
    // highlight's, and fade with it.
    expect(field).toHaveProp('cursorColor', Colors.accent);
    expect(field).toHaveProp('selectionHandleColor', Colors.accent);
  });

  /** On iOS the selection colour is the tint: iOS draws the highlight see-through itself. */
  it('on iOS, gives the accent as the selection colour', async () => {
    Platform.OS = 'ios';
    await render(<TextField label="Your letter" value="Dear Ben," multiline />);

    expect(screen.getByLabelText('Your letter')).toHaveProp('selectionColor', Colors.accent);
  });
});

describe('TextField and the focus', () => {
  /**
   * A form moves the focus to its next field when "next" is pressed, so it
   * needs the text input itself. React 19 passes a ref as an ordinary prop.
   */
  it('hands its ref to the text input, so a form can move the focus to it', async () => {
    const field = createRef<TextInput>();
    await render(<TextField ref={field} label="Password" value="" />);

    expect(field.current).toBeInstanceOf(TextInput);
    expect(field.current?.props).toMatchObject({ accessibilityLabel: 'Password' });
  });
});

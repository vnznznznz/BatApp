import { render, screen } from '@testing-library/react-native';
import { AccessibilityInfo, Platform, type ViewProps } from 'react-native';

import { StageHeading } from '@/features/auth/stage-heading';
import { announce } from '@/lib/announce';

jest.mock('@/lib/announce', () => ({ announce: jest.fn() }));
const mockedAnnounce = jest.mocked(announce);

const WORDS = 'Check your email. A code is on its way.';

let focus: jest.SpiedFunction<typeof AccessibilityInfo.sendAccessibilityEvent>;

/** What a screen reader was taken to: the event, and the view as a screen reader sees it. */
const focusedOn = () =>
  focus.mock.calls.map(([view, event]) => {
    const { accessible, accessibilityRole, accessibilityLabel } = (
      view as unknown as { props: ViewProps }
    ).props;
    return { event, accessible, accessibilityRole, accessibilityLabel };
  });

const DEFAULT_OS = Platform.OS;

beforeEach(() => {
  focus = jest.spyOn(AccessibilityInfo, 'sendAccessibilityEvent').mockImplementation(() => {});
  // React Native's own stand-in records every call, from every test before.
  focus.mockClear();
  mockedAnnounce.mockReset();
});

afterEach(() => {
  focus.mockRestore();
  Platform.OS = DEFAULT_OS;
});

describe('StageHeading', () => {
  /**
   * The focus is sent to a view, and a view a screen reader cannot land on
   * takes none: it would stay where it was, on a button that is gone, and say
   * nothing. Landed on, it reads the title and the words under it as one
   * heading, which is also what its rotor lists. (Found in review: taking the
   * view's accessibility away left every screen test passing.)
   */
  it('takes a screen reader to one heading that reads the title and the words under it', async () => {
    Platform.OS = 'ios';
    await render(<StageHeading title="Check your email" intro="A code is on its way." />);

    expect(focusedOn()).toEqual([
      { event: 'focus', accessible: true, accessibilityRole: 'header', accessibilityLabel: WORDS },
    ]);
    expect(screen.getByRole('header', { name: WORDS })).toBeOnTheScreen();
  });

  it('says the same aloud on the web, where nothing can be focused', async () => {
    Platform.OS = 'web';
    await render(<StageHeading title="Check your email" intro="A code is on its way." />);

    expect(mockedAnnounce).toHaveBeenCalledWith(WORDS);
    expect(focus).not.toHaveBeenCalled();
  });

  /** The same screen in another stage says what has become of it itself, with the reason. */
  it('moves nothing when it is drawn again with other words', async () => {
    Platform.OS = 'ios';
    const view = await render(
      <StageHeading title="Check your email" intro="A code is on its way." />,
    );

    await view.rerender(<StageHeading title="One more code" intro="Type the new code in below." />);

    expect(focusedOn()).toHaveLength(1);
    expect(
      screen.getByRole('header', { name: 'One more code. Type the new code in below.' }),
    ).toBeOnTheScreen();
  });
});

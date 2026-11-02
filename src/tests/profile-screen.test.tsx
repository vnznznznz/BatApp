import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { Alert, type AlertButton } from 'react-native';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';

import ProfileScreen from '@/app/(app)/profile';
import { REPORT_RETENTION_DAYS } from '@/constants/config';
import type { Profile } from '@/features/profile/use-profile';
import { formatTimestamp } from '@/lib/format';
import { openLink } from '@/lib/links';

// React Native loads its components on first use, and with a cold transform
// cache the first render compiles them: seconds of work, measured at over five
// on four cores, that would otherwise count against whichever test runs first.
jest.setTimeout(20_000);

const mockPush = jest.fn();

jest.mock('expo-router', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  return {
    useRouter: () => ({ push: mockPush, back: jest.fn(), replace: jest.fn() }),
    // There is no navigator here, so being mounted stands in for being focused.
    useFocusEffect: (effect: () => void | (() => void)) =>
      React.useEffect(() => effect(), [effect]),
  };
});

const mockSignOut = jest.fn<Promise<void>, []>();
const mockDeleteAccount = jest.fn<Promise<void>, []>();

// The screen is under test, not the auth stack. Mocking the context keeps this
// from becoming an integration test of Supabase's client.
jest.mock('@/features/auth/auth-context', () => ({
  useAuth: () => ({ signOut: mockSignOut, deleteAccount: mockDeleteAccount }),
}));

const mockProfileState: { profile: Profile | null; isLoading: boolean; error: string | null } = {
  profile: null,
  isLoading: false,
  error: null,
};
// Stable, as the real hook's are: the screen reloads the profile on focus, and a
// new function on every render would read as a new focus on every render.
const mockReloadProfile = jest.fn(() => Promise.resolve());
const mockUpdateDisplayName = jest.fn<Promise<void>, [displayName: string]>();

jest.mock('@/features/profile/use-profile', () => ({
  useProfile: () => ({
    ...mockProfileState,
    reload: mockReloadProfile,
    updateDisplayName: mockUpdateDisplayName,
  }),
}));

/** The two links, as this build is configured. Unset in the environment, each is null. */
const mockLinks: { contact: string | null; privacyPolicy: string | null } = {
  contact: null,
  privacyPolicy: null,
};

// Both links are configuration, read from the build's environment, and the
// screen leaves out whichever is unset. Getters, so the screen reads them as it
// renders and each test can configure them as a build would; opening one is the
// device's business. No spread of the real module: Babel turns a spread beside
// a getter into a copy, and the copy would read the getter once, too early.
jest.mock('@/lib/links', () => ({
  get CONTACT_URL() {
    return mockLinks.contact;
  },
  get PRIVACY_POLICY_URL() {
    return mockLinks.privacyPolicy;
  },
  openLink: jest.fn(),
}));

const mockedOpenLink = jest.mocked(openLink);

const CONTACT = 'mailto:night-courier@example.com';
const PRIVACY_POLICY = 'https://example.com/night-courier/privacy';

// Alerts are native. The spy records what would have been shown, and the test
// presses the buttons itself.
const mockedAlert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});

const courier: Profile = {
  id: 'user-mara',
  username: 'mara',
  displayName: 'Mara Lind',
  avatarUrl: null,
  move: null,
  city: { id: 2950159, name: 'Berlin', countryCode: 'DE' },
};

/** Fixed insets so the screen renders deterministically outside a device. */
const metrics: Metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

const renderScreen = (ui: ReactElement) =>
  render(<SafeAreaProvider initialMetrics={metrics}>{ui}</SafeAreaProvider>);

const nameField = () => screen.getByLabelText('Your name');
const button = (name: string) => screen.getByRole('button', { name });
const spinners = () => screen.container.queryAll((node) => node.type === 'ActivityIndicator');

/** The buttons of the alert shown last, in the order they are offered. */
function alertButtons(): AlertButton[] {
  const shown = mockedAlert.mock.calls.at(-1);
  if (!shown) throw new Error('No alert was shown.');
  return shown[2] ?? [];
}

/**
 * Presses one of the alert's buttons, as the courier would, and resolves once
 * whatever the button started is over - the same way `fireEvent` treats a
 * handler that returns a promise.
 */
async function answerAlert(choice: string) {
  const answer = alertButtons().find((candidate) => candidate.text === choice);
  if (!answer) throw new Error(`The alert has no "${choice}" button.`);
  let started: unknown;
  await act(() => {
    started = answer.onPress?.();
  });
  await started;
}

beforeEach(() => {
  mockPush.mockClear();
  mockedAlert.mockClear();
  mockReloadProfile.mockClear();
  mockProfileState.profile = courier;
  mockProfileState.isLoading = false;
  mockProfileState.error = null;
  mockSignOut.mockReset();
  mockSignOut.mockResolvedValue(undefined);
  mockDeleteAccount.mockReset();
  mockDeleteAccount.mockResolvedValue(undefined);
  mockUpdateDisplayName.mockReset();
  // As the real hook does: the saved name is read back before the save resolves.
  mockUpdateDisplayName.mockImplementation(async (displayName) => {
    mockProfileState.profile = { ...courier, displayName: displayName.trim() };
  });
  mockLinks.contact = null;
  mockLinks.privacyPolicy = null;
  mockedOpenLink.mockReset().mockResolvedValue(undefined);
});

describe('ProfileScreen', () => {
  describe('who you are', () => {
    it('shows the username, and that it cannot be changed', async () => {
      await renderScreen(<ProfileScreen />);

      expect(screen.getByText('@mara')).toBeOnTheScreen();
      expect(screen.getByText('How friends find you. It cannot be changed.')).toBeOnTheScreen();
      expect(screen.queryByLabelText('Username')).toBeNull();
    });

    // The city picker writes the change itself and pops back to this screen.
    it('reloads the profile when the screen comes into view', async () => {
      await renderScreen(<ProfileScreen />);

      expect(mockReloadProfile).toHaveBeenCalled();
    });

    it('shows a spinner rather than an empty profile while it first loads', async () => {
      mockProfileState.profile = null;
      mockProfileState.isLoading = true;
      await renderScreen(<ProfileScreen />);

      expect(spinners()).toHaveLength(1);
      expect(screen.queryByText(/^@/)).toBeNull();
      expect(screen.queryByLabelText('Your name')).toBeNull();
      expect(screen.queryByText('Not chosen yet')).toBeNull();
    });

    it('says when the profile could not be loaded again, and keeps what it had', async () => {
      mockProfileState.error = 'Your profile could not be loaded. Check your connection.';
      await renderScreen(<ProfileScreen />);

      expect(
        screen.getByText('Your profile could not be loaded. Check your connection.'),
      ).toBeOnTheScreen();
      expect(screen.getByText('@mara')).toBeOnTheScreen();
      expect(screen.getByText('Berlin, DE')).toBeOnTheScreen();
    });

    // Not loading is not the same as loaded. When the profile cannot be loaded
    // at all - offline on opening the screen, or the row missing - there is no
    // username to show, and a courier who chose a city long ago must not be
    // told they have none. Signing out has to stay: the missing-profile error
    // tells the courier to do exactly that.
    it('does not show an empty username, or say no city is chosen, when the profile could not be loaded', async () => {
      mockProfileState.profile = null;
      mockProfileState.isLoading = false;
      mockProfileState.error = 'Your profile is missing. Signing out and in again may recover it.';
      await renderScreen(<ProfileScreen />);

      expect(
        screen.getByText('Your profile is missing. Signing out and in again may recover it.'),
      ).toBeOnTheScreen();
      expect(screen.queryByText('@')).toBeNull();
      expect(screen.queryByText('Not chosen yet')).toBeNull();
      expect(button('Sign out')).toBeEnabled();
    });
  });

  describe('a move that has not settled', () => {
    it('says where letters still leave from, and until when', async () => {
      const settlesAt = new Date(Date.now() + 20 * 3_600_000);
      mockProfileState.profile = {
        ...courier,
        move: { from: { id: 2950159, name: 'Berlin', countryCode: 'DE' }, settlesAt },
      };
      await renderScreen(<ProfileScreen />);

      expect(
        screen.getByText(
          `Your bats are still settling in. Until ${formatTimestamp(settlesAt)}, letters leave from Berlin, DE.`,
        ),
      ).toBeOnTheScreen();
    });
  });

  describe('your name', () => {
    /**
     * Asking someone to be friends shows them your name before they have said
     * yes, so the hint names everyone who sees it: friends, and anyone you ask.
     * A screen reader says the same on reaching the field.
     */
    it('shows the name friends see, ready to change', async () => {
      const hint = 'What your friends, and anyone you ask to be friends, see.';
      await renderScreen(<ProfileScreen />);

      expect(nameField().props.value).toBe('Mara Lind');
      expect(screen.getByText(hint)).toBeOnTheScreen();
      expect(nameField().props.accessibilityHint).toBe(hint);
    });

    it('saves a new name, and says so', async () => {
      await renderScreen(<ProfileScreen />);

      await fireEvent.changeText(nameField(), 'Mara L.');
      await fireEvent.press(button('Save name'));

      expect(mockUpdateDisplayName).toHaveBeenCalledTimes(1);
      expect(mockUpdateDisplayName).toHaveBeenCalledWith('Mara L.');
      expect(screen.getByText('Saved.')).toBeOnTheScreen();
      expect(nameField().props.value).toBe('Mara L.');
    });

    it('saves from the keyboard as well', async () => {
      await renderScreen(<ProfileScreen />);

      await fireEvent.changeText(nameField(), 'Mara L.');
      await fireEvent(nameField(), 'submitEditing');

      expect(mockUpdateDisplayName).toHaveBeenCalledWith('Mara L.');
      expect(screen.getByText('Saved.')).toBeOnTheScreen();
    });

    it('does not save an empty name, and says why', async () => {
      await renderScreen(<ProfileScreen />);

      await fireEvent.changeText(nameField(), '   ');
      await fireEvent.press(button('Save name'));

      expect(mockUpdateDisplayName).not.toHaveBeenCalled();
      expect(screen.getByText('Enter a name your friends will recognise.')).toBeOnTheScreen();
      expect(screen.queryByText('Saved.')).toBeNull();
    });

    it('does not save a name that is too long, and says why', async () => {
      await renderScreen(<ProfileScreen />);

      await fireEvent.changeText(nameField(), 'M'.repeat(41));
      await fireEvent.press(button('Save name'));

      expect(mockUpdateDisplayName).not.toHaveBeenCalled();
      expect(screen.getByText('That name is a little long.')).toBeOnTheScreen();
    });

    it('reports a failed save without losing what was typed', async () => {
      mockUpdateDisplayName.mockRejectedValue(new Error('That name could not be saved.'));
      await renderScreen(<ProfileScreen />);

      await fireEvent.changeText(nameField(), 'Mara L.');
      await fireEvent.press(button('Save name'));

      expect(screen.getByText('That name could not be saved.')).toBeOnTheScreen();
      expect(screen.queryByText('Saved.')).toBeNull();
      expect(nameField().props.value).toBe('Mara L.');
    });

    it('stops saying it was saved once the name is changed again', async () => {
      await renderScreen(<ProfileScreen />);
      await fireEvent.changeText(nameField(), 'Mara L.');
      await fireEvent.press(button('Save name'));
      expect(screen.getByText('Saved.')).toBeOnTheScreen();

      await fireEvent.changeText(nameField(), 'Mara Li');

      expect(screen.queryByText('Saved.')).toBeNull();
    });

    it('cannot save again while a save is under way', async () => {
      let finishSaving: () => void = () => {};
      mockUpdateDisplayName.mockReturnValue(
        new Promise<void>((resolve) => {
          finishSaving = resolve;
        }),
      );
      await renderScreen(<ProfileScreen />);
      await fireEvent.changeText(nameField(), 'Mara L.');

      // Not awaited yet: a press is only over once the save it started is.
      const firstPress = fireEvent.press(button('Save name'));
      await waitFor(() => expect(button('Save name')).toBeBusy());
      await fireEvent.press(button('Save name'));

      expect(mockUpdateDisplayName).toHaveBeenCalledTimes(1);

      await act(async () => finishSaving());
      await firstPress;
      expect(screen.getByText('Saved.')).toBeOnTheScreen();
      expect(button('Save name')).toBeEnabled();
    });
  });

  describe('your city', () => {
    it('shows the city the bats fly from, and offers to change it', async () => {
      await renderScreen(<ProfileScreen />);

      expect(screen.getByText('Berlin, DE')).toBeOnTheScreen();
      expect(
        screen.getByText('Distance from here decides how long your bats fly.'),
      ).toBeOnTheScreen();

      await fireEvent.press(button('Change city'));

      expect(mockPush).toHaveBeenCalledWith('/city-picker');
    });

    it('asks for a city when none is chosen', async () => {
      mockProfileState.profile = { ...courier, city: null };
      await renderScreen(<ProfileScreen />);

      expect(screen.getByText('Not chosen yet')).toBeOnTheScreen();
      expect(
        screen.getByText('Your bats cannot fly anywhere until you pick a city.'),
      ).toBeOnTheScreen();
      expect(screen.queryByRole('button', { name: 'Change city' })).toBeNull();

      await fireEvent.press(button('Choose your city'));

      expect(mockPush).toHaveBeenCalledWith('/city-picker');
    });
  });

  describe('safety', () => {
    it('opens the couriers you have blocked', async () => {
      await renderScreen(<ProfileScreen />);
      expect(screen.getByText('Safety')).toBeOnTheScreen();

      await fireEvent.press(button('Blocked couriers'));

      expect(mockPush).toHaveBeenCalledTimes(1);
      expect(mockPush).toHaveBeenCalledWith('/blocked');
    });

    it('opens the house rules', async () => {
      await renderScreen(<ProfileScreen />);

      await fireEvent.press(button('House rules'));

      expect(mockPush).toHaveBeenCalledTimes(1);
      expect(mockPush).toHaveBeenCalledWith('/rules');
    });

    /**
     * Nothing here depends on the profile. A courier whose profile will not
     * load can still unblock someone, read the rules, and get in touch - which,
     * with their profile gone missing, they may well need to.
     */
    it('is all still there when the profile could not be loaded', async () => {
      mockProfileState.profile = null;
      mockProfileState.error = 'Your profile is missing. Signing out and in again may recover it.';
      mockLinks.contact = CONTACT;
      await renderScreen(<ProfileScreen />);

      expect(screen.getByText('Safety')).toBeOnTheScreen();
      expect(button('Blocked couriers')).toBeEnabled();
      expect(button('House rules')).toBeEnabled();
      expect(button('Contact')).toBeEnabled();

      await fireEvent.press(button('Blocked couriers'));

      expect(mockPush).toHaveBeenCalledWith('/blocked');
    });

    it('offers no Contact or Privacy policy while neither link is configured', async () => {
      await renderScreen(<ProfileScreen />);

      expect(screen.queryByRole('button', { name: 'Contact' })).toBeNull();
      expect(screen.queryByRole('button', { name: 'Privacy policy' })).toBeNull();
    });

    /**
     * App Review asks an app with user content for published contact
     * information, and for its privacy policy to be linked in the app. A build
     * for anyone else configures both.
     */
    it('offers a way to get in touch once a contact address is configured, and opens it', async () => {
      mockLinks.contact = CONTACT;
      await renderScreen(<ProfileScreen />);
      expect(screen.queryByRole('button', { name: 'Privacy policy' })).toBeNull();

      await fireEvent.press(button('Contact'));

      expect(mockedOpenLink).toHaveBeenCalledTimes(1);
      expect(mockedOpenLink).toHaveBeenCalledWith(CONTACT);
    });

    it('offers the privacy policy once one is configured, and opens it', async () => {
      mockLinks.privacyPolicy = PRIVACY_POLICY;
      await renderScreen(<ProfileScreen />);
      expect(screen.queryByRole('button', { name: 'Contact' })).toBeNull();

      await fireEvent.press(button('Privacy policy'));

      expect(mockedOpenLink).toHaveBeenCalledTimes(1);
      expect(mockedOpenLink).toHaveBeenCalledWith(PRIVACY_POLICY);
    });
  });

  describe('your account', () => {
    it('signs out', async () => {
      await renderScreen(<ProfileScreen />);

      await fireEvent.press(button('Sign out'));

      expect(mockSignOut).toHaveBeenCalledTimes(1);
      expect(mockDeleteAccount).not.toHaveBeenCalled();
      expect(mockedAlert).not.toHaveBeenCalled();
    });

    /**
     * Deleting an account takes its letters from both sides: the ones a friend
     * received go from their inbox too. Nobody should learn that afterwards.
     */
    it("asks before deleting the account, and says that letters sent leave friends' inboxes too", async () => {
      await renderScreen(<ProfileScreen />);

      await fireEvent.press(button('Delete my account'));

      expect(mockedAlert).toHaveBeenCalledTimes(1);
      const [title, message] = mockedAlert.mock.calls[0] ?? [];
      expect(title).toBe('Delete your account?');
      expect(message).toContain(
        'every letter you have sent or received are removed permanently, from your friends’ ' +
          'letters as well as yours.',
      );
      expect(message).toContain('This cannot be undone.');
      expect(alertButtons().map(({ text, style }) => ({ text, style }))).toEqual([
        { text: 'Keep my account', style: 'cancel' },
        { text: 'Delete', style: 'destructive' },
      ]);
      expect(mockDeleteAccount).not.toHaveBeenCalled();
    });

    /**
     * Reports are the exception to a deletion, both ways: the people who run
     * Night Courier may still have to act on one, about the courier or made by
     * them. The courier is told what each keeps, and for how long, in the
     * number the database deletes by - parity.db.test.mjs holds the two
     * together.
     */
    it('says what reports keep once the account is gone, and when each is deleted', async () => {
      await renderScreen(<ProfileScreen />);

      await fireEvent.press(button('Delete my account'));

      const [, message] = mockedAlert.mock.calls[0] ?? [];
      expect(message).toContain(
        'Reports are the exception: a report about you keeps your names and any letter of ' +
          'yours it is about, and a report you made keeps what you wrote in it.',
      );
      expect(message).toContain(`Each is deleted ${REPORT_RETENTION_DAYS} days after it was made.`);
    });

    it('keeps the account when the courier thinks better of it', async () => {
      await renderScreen(<ProfileScreen />);
      await fireEvent.press(button('Delete my account'));

      await answerAlert('Keep my account');

      expect(mockDeleteAccount).not.toHaveBeenCalled();
      expect(button('Delete my account')).toBeEnabled();
    });

    it('deletes the account once that is confirmed', async () => {
      await renderScreen(<ProfileScreen />);
      await fireEvent.press(button('Delete my account'));

      await answerAlert('Delete');

      expect(mockDeleteAccount).toHaveBeenCalledTimes(1);
      expect(mockSignOut).not.toHaveBeenCalled();
    });

    it('shows that the deletion is under way, and cannot start it again', async () => {
      let finishDeleting: () => void = () => {};
      mockDeleteAccount.mockReturnValue(
        new Promise<void>((resolve) => {
          finishDeleting = resolve;
        }),
      );
      await renderScreen(<ProfileScreen />);
      await fireEvent.press(button('Delete my account'));

      // Not awaited yet: the answer is only over once the deletion is.
      const answered = answerAlert('Delete');
      await waitFor(() => expect(button('Delete my account')).toBeBusy());
      expect(button('Delete my account')).toBeDisabled();
      await fireEvent.press(button('Delete my account'));

      expect(mockedAlert).toHaveBeenCalledTimes(1);
      expect(mockDeleteAccount).toHaveBeenCalledTimes(1);

      await act(async () => finishDeleting());
      await answered;
    });

    it('says why the account could not be deleted, and lets the courier try again', async () => {
      mockDeleteAccount.mockRejectedValue(
        new Error('Your account could not be deleted. Please try again.'),
      );
      await renderScreen(<ProfileScreen />);
      await fireEvent.press(button('Delete my account'));

      await answerAlert('Delete');

      expect(mockedAlert).toHaveBeenCalledTimes(2);
      expect(mockedAlert).toHaveBeenLastCalledWith(
        'Could not delete',
        'Your account could not be deleted. Please try again.',
      );
      expect(button('Delete my account')).toBeEnabled();
    });

    it('offers nothing for sale', async () => {
      await renderScreen(<ProfileScreen />);

      expect(
        screen.queryAllByText(/buy|purchase|upgrade|premium|subscri|unlock|pro plan/i),
      ).toHaveLength(0);
    });
  });
});

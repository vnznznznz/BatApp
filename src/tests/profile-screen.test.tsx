import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { Alert, type AlertButton } from 'react-native';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';

import ProfileScreen from '@/app/(app)/profile';
import type { Profile } from '@/features/profile/use-profile';
import { formatTimestamp } from '@/lib/format';

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
    it('shows the name friends see, ready to change', async () => {
      await renderScreen(<ProfileScreen />);

      expect(nameField().props.value).toBe('Mara Lind');
      expect(screen.getByText('What your friends see.')).toBeOnTheScreen();
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
      expect(message).toContain('Letters you sent disappear from your friends’ inboxes too.');
      expect(message).toContain('This cannot be undone.');
      expect(alertButtons().map(({ text, style }) => ({ text, style }))).toEqual([
        { text: 'Keep my account', style: 'cancel' },
        { text: 'Delete', style: 'destructive' },
      ]);
      expect(mockDeleteAccount).not.toHaveBeenCalled();
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

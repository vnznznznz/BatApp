import { act, fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { Alert } from 'react-native';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';

import CityPickerScreen from '@/app/(app)/city-picker';
import { CITY_DATA_CREDIT, searchCities, type City } from '@/features/cities/search';
import type { Profile } from '@/features/profile/use-profile';

// React Native loads its components on first use, and with a cold transform
// cache the first render compiles them: seconds of work that would otherwise
// count against whichever test runs first.
jest.setTimeout(20_000);

const mockBack = jest.fn();
/** Whether the picker is still in front when a save comes back. */
const mockFocus = { focused: true };

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: mockBack, push: jest.fn(), replace: jest.fn() }),
  useNavigation: () => ({ isFocused: () => mockFocus.focused }),
}));

// The search is the network's part; the credit and the way a city is named are
// kept, so what the picker shows is what it would show for real.
jest.mock('@/features/cities/search', () => ({
  ...jest.requireActual('@/features/cities/search'),
  searchCities: jest.fn(),
}));

const mockProfileState: { profile: Profile | null } = { profile: null };
const mockUpdateCity = jest.fn<Promise<void>, [number]>();

jest.mock('@/features/profile/use-profile', () => ({
  useProfile: () => ({
    profile: mockProfileState.profile,
    isLoading: false,
    error: null,
    updateCity: mockUpdateCity,
  }),
}));

const mockedSearchCities = jest.mocked(searchCities);

/**
 * A fixed moment, in the reader's local time: a move made now settles at the
 * same time tomorrow, and the confirmation says when.
 */
const NOW = new Date(2026, 10, 17, 21, 0).getTime();

const hamburg: City = {
  id: 2911298,
  name: 'Hamburg',
  countryCode: 'DE',
  population: 1_739_117,
  qualifier: null,
};
const hameln: City = {
  id: 2911271,
  name: 'Hameln',
  countryCode: 'DE',
  population: 57_510,
  qualifier: null,
};

/** Two towns of one name in one country, as the search returns them. */
const friedbergBavaria: City = {
  id: 2924803,
  name: 'Friedberg',
  countryCode: 'DE',
  population: 29_953,
  qualifier: 'near Augsburg',
};
const friedbergHessen: City = {
  id: 2924802,
  name: 'Friedberg',
  countryCode: 'DE',
  population: 27_484,
  qualifier: 'near Frankfurt am Main',
};

const courier: Profile = {
  id: 'user-mara',
  username: 'mara',
  displayName: 'Mara Lind',
  avatarUrl: null,
  city: { id: 2950159, name: 'Berlin', countryCode: 'DE' },
  move: null,
};

const TOO_SHORT = 'Type at least two letters.';
const NO_SUCH_CITY = 'No city by that name. Try the nearest larger town.';
const SEARCH_FAILED = 'Cities could not be searched. Check your connection.';

/** Fixed insets so the screen renders deterministically outside a device. */
const metrics: Metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

const renderScreen = (ui: ReactElement) =>
  render(<SafeAreaProvider initialMetrics={metrics}>{ui}</SafeAreaProvider>);

/** A promise the test settles by hand, to look at the screen while a call is in flight. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((settle, fail) => {
    resolve = settle;
    reject = fail;
  });
  return { promise, resolve, reject };
}

const field = () => screen.getByLabelText('City');
const spinners = () => screen.container.queryAll((node) => node.type === 'ActivityIndicator');

/** Types into the field as a person does: the whole text so far, in one change. */
const type = (text: string) => fireEvent.changeText(field(), text);

/** Lets the pause after the last keystroke pass, and the search it starts answer. */
const pause = () => act(async () => jest.advanceTimersByTimeAsync(300));

/** Types, waits for the answer, and taps the row of `city`. */
async function choose(text: string, city: City) {
  await type(text);
  await pause();
  await fireEvent.press(screen.getByRole('button', { name: new RegExp(`^${city.name}`) }));
}

let alertSpy: jest.SpiedFunction<typeof Alert.alert>;

/** The alert the screen raised most recently: its title, its message and its buttons. */
function lastAlert() {
  const call = alertSpy.mock.lastCall;
  if (!call) throw new Error('No alert was shown.');
  const [title, message, buttons = []] = call;
  return { title, message, buttons: buttons.map((choice) => choice.text) };
}

/** Taps a button on the alert the screen raised most recently. */
async function chooseInAlert(label: string) {
  const choice = alertSpy.mock.lastCall?.[2]?.find((candidate) => candidate.text === label);
  if (!choice) throw new Error(`The alert has no "${label}" button.`);
  await act(async () => choice.onPress?.());
}

beforeEach(() => {
  jest.useFakeTimers({ now: NOW });
  mockBack.mockClear();
  mockFocus.focused = true;
  mockProfileState.profile = courier;
  mockUpdateCity.mockReset().mockResolvedValue(undefined);
  mockedSearchCities.mockReset().mockResolvedValue([hamburg, hameln]);
  alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});

afterEach(() => {
  alertSpy.mockRestore();
  jest.useRealTimers();
});

describe('CityPickerScreen', () => {
  describe('searching', () => {
    it('asks for two letters before it searches', async () => {
      await renderScreen(<CityPickerScreen />);

      await type('H');
      await pause();

      expect(screen.getByText(TOO_SHORT)).toBeOnTheScreen();
      expect(mockedSearchCities).not.toHaveBeenCalled();
    });

    /**
     * Two Friedbergs, two Hamms, two Langens: the same row twice, and a tap
     * on the wrong one counted at once. (Found in review.)
     */
    it('says where each of two towns of the same name is', async () => {
      mockedSearchCities.mockResolvedValue([friedbergBavaria, friedbergHessen]);
      await renderScreen(<CityPickerScreen />);

      await type('Friedberg');
      await pause();

      const rows = screen.getAllByRole('button', { name: /^Friedberg/ });
      expect(rows).toHaveLength(2);
      expect(rows[0]).toHaveTextContent(/near Augsburg/);
      expect(rows[1]).toHaveTextContent(/near Frankfurt am Main/);
      expect(screen.getByText(CITY_DATA_CREDIT)).toBeOnTheScreen();
    });

    it('lists the cities found, by name and country', async () => {
      await renderScreen(<CityPickerScreen />);

      await type('Ham');
      await pause();

      expect(mockedSearchCities).toHaveBeenCalledWith('Ham');
      expect(screen.getByText('Hamburg')).toBeOnTheScreen();
      expect(screen.getByText('Hameln')).toBeOnTheScreen();
      expect(screen.queryByText(NO_SUCH_CITY)).toBeNull();
    });

    /**
     * The search starts only once typing pauses. Until it has answered, the
     * picker does not know there is no such city, and does not say so: it
     * shows that it is looking. (It once said "No city by that name" for the
     * quarter of a second before the search began.)
     */
    it('says nothing about a city it has not looked for yet, and shows that it is looking', async () => {
      const answer = deferred<City[]>();
      mockedSearchCities.mockReturnValue(answer.promise);
      await renderScreen(<CityPickerScreen />);

      await type('Ha');

      expect(screen.queryByText(NO_SUCH_CITY)).toBeNull();
      expect(spinners()).toHaveLength(1);

      await pause();
      expect(screen.queryByText(NO_SUCH_CITY)).toBeNull();
      expect(spinners()).toHaveLength(1);

      await act(async () => answer.resolve([]));
      expect(screen.getByText(NO_SUCH_CITY)).toBeOnTheScreen();
      expect(spinners()).toHaveLength(0);
    });

    it('shows nothing of the answer to earlier words while new ones are searched', async () => {
      mockedSearchCities.mockResolvedValueOnce([]).mockResolvedValueOnce([hamburg]);
      await renderScreen(<CityPickerScreen />);
      await type('Hamburgo');
      await pause();
      expect(screen.getByText(NO_SUCH_CITY)).toBeOnTheScreen();

      await type('Hamburg');

      expect(screen.queryByText(NO_SUCH_CITY)).toBeNull();
      expect(spinners()).toHaveLength(1);
      await pause();
      expect(screen.getByText('Hamburg')).toBeOnTheScreen();
    });

    /** A search that failed has found nothing out, so it claims nothing. */
    it('says the search failed, and not that there is no such city', async () => {
      mockedSearchCities.mockRejectedValue(new Error(SEARCH_FAILED));
      await renderScreen(<CityPickerScreen />);

      await type('Hamburg');
      await pause();

      expect(screen.getByText(SEARCH_FAILED)).toBeOnTheScreen();
      expect(screen.queryByText(NO_SUCH_CITY)).toBeNull();
      expect(spinners()).toHaveLength(0);
    });

    it('lets go of a failed search once the field is cleared', async () => {
      mockedSearchCities.mockRejectedValue(new Error(SEARCH_FAILED));
      await renderScreen(<CityPickerScreen />);
      await type('Hamburg');
      await pause();
      expect(screen.getByText(SEARCH_FAILED)).toBeOnTheScreen();

      await type('');

      expect(screen.queryByText(SEARCH_FAILED)).toBeNull();
      expect(screen.getByText(TOO_SHORT)).toBeOnTheScreen();
    });

    /**
     * After a failure the same words are the obvious thing to try again - a
     * space added, the word typed over. The search once ran only when the
     * trimmed words changed, so neither tried again.
     */
    it.each([
      ['with a space added', 'Hamburg '],
      ['typed over', 'Hamburg'],
    ])('searches again after a failure when the same words are %s', async (_, again) => {
      mockedSearchCities.mockRejectedValueOnce(new Error(SEARCH_FAILED));
      await renderScreen(<CityPickerScreen />);
      await type('Hamburg');
      await pause();
      expect(screen.getByText(SEARCH_FAILED)).toBeOnTheScreen();

      await type(again);
      await pause();

      expect(mockedSearchCities).toHaveBeenCalledTimes(2);
      expect(screen.queryByText(SEARCH_FAILED)).toBeNull();
      expect(screen.getByText('Hamburg')).toBeOnTheScreen();
    });

    it('searches again after a failure when the search key is pressed', async () => {
      mockedSearchCities.mockRejectedValueOnce(new Error(SEARCH_FAILED));
      await renderScreen(<CityPickerScreen />);
      await type('Hamburg');
      await pause();

      await fireEvent(field(), 'submitEditing');
      await pause();

      expect(mockedSearchCities).toHaveBeenCalledTimes(2);
      expect(screen.getByText('Hamburg')).toBeOnTheScreen();
    });

    /** One search per pause in typing, not one per keystroke. */
    it('waits for a pause in typing, then searches only the words typed last', async () => {
      await renderScreen(<CityPickerScreen />);

      await type('Ha');
      await act(async () => jest.advanceTimersByTimeAsync(200));
      await type('Ham');
      await act(async () => jest.advanceTimersByTimeAsync(200));
      await type('Hamb');
      await act(async () => jest.advanceTimersByTimeAsync(200));
      expect(mockedSearchCities).not.toHaveBeenCalled();

      await pause();

      expect(mockedSearchCities).toHaveBeenCalledTimes(1);
      expect(mockedSearchCities).toHaveBeenCalledWith('Hamb');
    });

    /**
     * An answer for earlier words can come after the answer for later ones.
     * It is let go, whether it found cities or failed: the later answer stays,
     * rather than giving way to a spinner that never ends.
     */
    it.each<[string, (earlier: ReturnType<typeof deferred<City[]>>) => void]>([
      ['found cities', (earlier) => earlier.resolve([hameln])],
      ['failed', (earlier) => earlier.reject(new Error(SEARCH_FAILED))],
    ])('keeps the newest answer when an earlier search that %s answers late', async (_, settle) => {
      const earlier = deferred<City[]>();
      const later = deferred<City[]>();
      mockedSearchCities.mockReturnValueOnce(earlier.promise).mockReturnValueOnce(later.promise);
      await renderScreen(<CityPickerScreen />);
      await type('Ham');
      await pause();
      await type('Hamb');
      await pause();

      await act(async () => later.resolve([hamburg]));
      await act(async () => settle(earlier));

      expect(screen.getByText('Hamburg')).toBeOnTheScreen();
      expect(screen.queryByText('Hameln')).toBeNull();
      expect(screen.queryByText(SEARCH_FAILED)).toBeNull();
      expect(spinners()).toHaveLength(0);
    });

    /**
     * Cut back to one letter while the search was still out, the field asks
     * for more; a failure that comes back then is not about these words.
     */
    it('says nothing of a search that failed after the words were cut short', async () => {
      const answer = deferred<City[]>();
      mockedSearchCities.mockReturnValue(answer.promise);
      await renderScreen(<CityPickerScreen />);
      await type('Ham');
      await pause();

      await type('H');
      await act(async () => answer.reject(new Error(SEARCH_FAILED)));

      expect(screen.queryByText(SEARCH_FAILED)).toBeNull();
      expect(screen.getByText(TOO_SHORT)).toBeOnTheScreen();
    });

    /** Trying again, the old failure is not the answer: the picker is looking. */
    it('shows that it is looking, not the old failure, while it tries again', async () => {
      const again = deferred<City[]>();
      mockedSearchCities
        .mockRejectedValueOnce(new Error(SEARCH_FAILED))
        .mockReturnValueOnce(again.promise);
      await renderScreen(<CityPickerScreen />);
      await type('Hamburg');
      await pause();
      expect(screen.getByText(SEARCH_FAILED)).toBeOnTheScreen();

      await type('Hamburg ');
      await pause();

      expect(mockedSearchCities).toHaveBeenCalledTimes(2);
      expect(screen.queryByText(SEARCH_FAILED)).toBeNull();
      expect(spinners()).toHaveLength(1);
      await act(async () => again.resolve([hamburg]));
      expect(screen.getByText('Hamburg')).toBeOnTheScreen();
    });

    it('does not search the same words again once they have been answered', async () => {
      await renderScreen(<CityPickerScreen />);
      await type('Hamburg');
      await pause();

      await type('Hamburg ');
      await pause();

      expect(mockedSearchCities).toHaveBeenCalledTimes(1);
    });
  });

  describe('the keyboard', () => {
    /**
     * The field takes focus when the picker opens, so the keyboard is up from
     * the start. On iOS the list's insets follow it, so the last rows can be
     * scrolled above it, and dragging the list puts it away.
     */
    it('keeps the results reachable above the keyboard, and lets a drag put it away', async () => {
      await renderScreen(<CityPickerScreen />);

      // The screen itself does not scroll, so the one scroll view is the list's.
      const lists = screen.container.queryAll((node) => node.type === 'RCTScrollView');
      expect(lists).toHaveLength(1);
      expect(lists[0]).toHaveProp('automaticallyAdjustKeyboardInsets', true);
      expect(lists[0]).toHaveProp('keyboardDismissMode', 'on-drag');
    });
  });

  describe('the credit', () => {
    /**
     * The city data is GeoNames', under CC BY 4.0, which asks for the credit
     * wherever the data is shown - in every state of the list.
     */
    it('credits GeoNames before a search, while it runs, beside results, beside none, and after a failure', async () => {
      mockedSearchCities
        .mockResolvedValueOnce([hamburg])
        .mockResolvedValueOnce([])
        .mockRejectedValueOnce(new Error(SEARCH_FAILED));
      await renderScreen(<CityPickerScreen />);
      expect(screen.getByText(CITY_DATA_CREDIT)).toBeOnTheScreen();

      for (const text of ['Hamburg', 'Hamburgo', 'Hamburgos']) {
        await type(text);
        // Looking: the spinner, and the credit beneath it.
        expect(spinners()).toHaveLength(1);
        expect(screen.getByText(CITY_DATA_CREDIT)).toBeOnTheScreen();
        await pause();
        expect(screen.getByText(CITY_DATA_CREDIT)).toBeOnTheScreen();
      }
      expect(screen.getByText(SEARCH_FAILED)).toBeOnTheScreen();
    });
  });

  describe('choosing', () => {
    /**
     * A first city counts at once, so a slip of the finger would put the wrong
     * town in effect - and correcting it would then take a day. The picker
     * asks first, and says so.
     */
    it('asks before saving a first city, and says it counts at once and a change later takes a day', async () => {
      mockProfileState.profile = { ...courier, city: null };
      await renderScreen(<CityPickerScreen />);

      await choose('Ham', hamburg);

      expect(mockUpdateCity).not.toHaveBeenCalled();
      expect(lastAlert()).toEqual({
        title: 'Make Hamburg, DE your city?',
        message:
          'It counts at once: your bats fly from Hamburg, DE from now on. If you change it ' +
          'later, the new city takes a day to count.',
        buttons: ['Cancel', 'Choose'],
      });
    });

    it('names the town it asks about by where it is, when another has its name', async () => {
      mockProfileState.profile = { ...courier, city: null };
      mockedSearchCities.mockResolvedValue([friedbergBavaria, friedbergHessen]);
      await renderScreen(<CityPickerScreen />);
      await type('Friedberg');
      await pause();

      await fireEvent.press(screen.getAllByRole('button', { name: /^Friedberg/ })[1]!);

      expect(lastAlert().title).toBe('Make Friedberg (near Frankfurt am Main), DE your city?');
    });

    it('asks before a move, and says it takes a day, during which letters leave from the old city', async () => {
      await renderScreen(<CityPickerScreen />);

      await choose('Ham', hamburg);

      expect(mockUpdateCity).not.toHaveBeenCalled();
      expect(lastAlert()).toEqual({
        title: 'Move to Hamburg, DE?',
        message:
          'A move takes a day to count. Until 18 Nov 21:00, your letters leave from Berlin, DE, ' +
          "and your friends' letters land there.",
        buttons: ['Cancel', 'Move'],
      });
    });

    /**
     * Asked on New Year's Eve, the day the move settles is in the next year.
     * It still says at what time: "Until 1 Jan 2027" alone left the courier to
     * guess. (Found in review.)
     */
    it.each([
      ['on New Year’s Eve', new Date(2026, 11, 31, 21, 0), '1 Jan 2027 21:00'],
      ['just after midnight on New Year’s Eve', new Date(2026, 11, 31, 0, 30), '1 Jan 2027 00:30'],
      ['the evening before New Year’s Eve', new Date(2026, 11, 30, 23, 30), '31 Dec 23:30'],
    ])('names the day and the time the move settles when asked %s', async (_, asked, settles) => {
      jest.setSystemTime(asked);
      await renderScreen(<CityPickerScreen />);

      await choose('Ham', hamburg);

      expect(lastAlert().message).toBe(
        `A move takes a day to count. Until ${settles}, your letters leave from Berlin, ` +
          "DE, and your friends' letters land there.",
      );
    });

    /**
     * Moving again before the last move has settled starts the day again, and
     * the bats are still where they were before either move.
     */
    it('names the city the bats still fly from when a move is already settling', async () => {
      mockProfileState.profile = {
        ...courier,
        city: { id: 2867714, name: 'Munich', countryCode: 'DE' },
        move: {
          from: { id: 2950159, name: 'Berlin', countryCode: 'DE' },
          settlesAt: new Date(NOW + 3_600_000),
        },
      };
      await renderScreen(<CityPickerScreen />);

      await choose('Ham', hamburg);

      expect(lastAlert().message).toBe(
        'A move takes a day to count. Until 18 Nov 21:00, your letters leave from Berlin, DE, ' +
          "and your friends' letters land there.",
      );
    });

    it('says a move back to where the bats still are counts at once', async () => {
      mockProfileState.profile = {
        ...courier,
        city: { id: 2867714, name: 'Munich', countryCode: 'DE' },
        move: { from: { ...hamburg }, settlesAt: new Date(NOW + 3_600_000) },
      };
      await renderScreen(<CityPickerScreen />);

      await choose('Ham', hamburg);

      expect(lastAlert()).toEqual({
        title: 'Move back to Hamburg, DE?',
        message: 'Your bats are still there, so it counts at once.',
        buttons: ['Cancel', 'Move'],
      });
    });

    /** Without the profile, the picker cannot tell which applies, and says both. */
    it('says what holds either way when the profile has not loaded', async () => {
      mockProfileState.profile = null;
      await renderScreen(<CityPickerScreen />);

      await choose('Ham', hamburg);

      expect(lastAlert()).toEqual({
        title: 'Make Hamburg, DE your city?',
        message:
          'A first city counts at once. If you have one already, a move takes a day to count, ' +
          'and letters leave from your old city until then.',
        buttons: ['Cancel', 'Choose'],
      });
    });

    it('saves nothing, and stays, if the courier thinks better of it', async () => {
      await renderScreen(<CityPickerScreen />);
      await choose('Ham', hamburg);

      await chooseInAlert('Cancel');

      expect(mockUpdateCity).not.toHaveBeenCalled();
      expect(mockBack).not.toHaveBeenCalled();
      expect(screen.getByRole('button', { name: /^Hamburg/ })).toBeEnabled();
    });

    it('goes back without asking when the city chosen is already theirs', async () => {
      mockProfileState.profile = { ...courier, city: { ...hamburg } };
      await renderScreen(<CityPickerScreen />);

      await choose('Ham', hamburg);

      expect(alertSpy).not.toHaveBeenCalled();
      expect(mockUpdateCity).not.toHaveBeenCalled();
      expect(mockBack).toHaveBeenCalledTimes(1);
    });

    it('saves the city once confirmed, and goes back', async () => {
      await renderScreen(<CityPickerScreen />);
      await choose('Ham', hamburg);

      await chooseInAlert('Move');

      expect(mockUpdateCity).toHaveBeenCalledTimes(1);
      expect(mockUpdateCity).toHaveBeenCalledWith(hamburg.id);
      expect(mockBack).toHaveBeenCalledTimes(1);
    });

    /**
     * On a slow connection the save can answer long after the courier has
     * left the picker - for a letter they are now writing. Going back then
     * would close that letter instead. (Found in review.)
     */
    it('stays where the courier has gone if they left before the save answered', async () => {
      const saving = deferred<void>();
      mockUpdateCity.mockReturnValue(saving.promise);
      await renderScreen(<CityPickerScreen />);
      await choose('Ham', hamburg);
      await chooseInAlert('Move');

      mockFocus.focused = false;
      await act(async () => saving.resolve());

      expect(mockUpdateCity).toHaveBeenCalledTimes(1);
      expect(mockBack).not.toHaveBeenCalled();
      // Left as it was, for whenever they come back to it.
      expect(spinners()).toHaveLength(0);
      expect(screen.getByRole('button', { name: /^Hamburg/ })).toBeEnabled();
      expect(screen.getByRole('button', { name: /^Hameln/ })).toBeEnabled();
    });

    /** One save at a time, shown on the row it is for. */
    it('shows the save on the row chosen, and takes no other choice meanwhile', async () => {
      const saving = deferred<void>();
      mockUpdateCity.mockReturnValue(saving.promise);
      await renderScreen(<CityPickerScreen />);
      await choose('Ham', hamburg);
      await chooseInAlert('Move');

      const row = screen.getByRole('button', { name: /^Hamburg/ });
      expect(spinners()).toHaveLength(1);
      expect(row.queryAll((node) => node.type === 'ActivityIndicator')).toHaveLength(1);
      expect(row).toBeDisabled();
      expect(screen.getByRole('button', { name: /^Hameln/ })).toBeDisabled();
      await fireEvent.press(screen.getByRole('button', { name: /^Hameln/ }));
      expect(alertSpy).toHaveBeenCalledTimes(1);

      await act(async () => saving.resolve());
    });

    it('says why a save failed, and stays so the courier can try again', async () => {
      mockUpdateCity.mockRejectedValue(new Error('That city could not be saved.'));
      await renderScreen(<CityPickerScreen />);
      await choose('Ham', hamburg);

      await chooseInAlert('Move');

      expect(screen.getByText('That city could not be saved.')).toBeOnTheScreen();
      expect(mockBack).not.toHaveBeenCalled();
      expect(screen.getByRole('button', { name: /^Hamburg/ })).toBeEnabled();
    });

    it('lets go of a failed save once the courier tries again', async () => {
      const again = deferred<void>();
      mockUpdateCity
        .mockRejectedValueOnce(new Error('That city could not be saved.'))
        .mockReturnValueOnce(again.promise);
      await renderScreen(<CityPickerScreen />);
      await choose('Ham', hamburg);
      await chooseInAlert('Move');
      expect(screen.getByText('That city could not be saved.')).toBeOnTheScreen();

      await fireEvent.press(screen.getByRole('button', { name: /^Hamburg/ }));
      await chooseInAlert('Move');

      expect(screen.queryByText('That city could not be saved.')).toBeNull();
      await act(async () => again.resolve());
      expect(mockBack).toHaveBeenCalledTimes(1);
    });
  });
});

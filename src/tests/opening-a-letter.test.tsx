import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { View } from 'react-native';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';

import LetterScreen from '@/app/(app)/letters/[id]';
import LettersScreen from '@/app/(app)/letters/index';
import type { InboxRow, LetterRow } from '@/features/messages/messages';
import type { ApiError } from '@/lib/rpc-error';

// React Native loads its components on first use, and with a cold transform
// cache the first render compiles them: seconds of work, measured at over five
// on four cores, that would otherwise count against whichever test runs first.
jest.setTimeout(20_000);

const mockPush = jest.fn();
/** The route's params: the id of the letter that is open. */
const mockParams: { id: string } = { id: '' };

/**
 * Stands in for navigation focus. There is no navigator here, so mounting is
 * the first focus, and `comeBack()` is the list coming into view again when the
 * letter on top of it is closed - which is when `useFocusEffect` runs again.
 */
const mockFocus = { returns: new Set<() => void>() };

jest.mock('expo-router', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  return {
    useRouter: () => ({
      push: mockPush,
      back: jest.fn(),
      replace: jest.fn(),
      dismissTo: jest.fn(),
    }),
    useNavigation: () => ({ isFocused: () => true }),
    useLocalSearchParams: () => mockParams,
    useFocusEffect: (effect: () => void | (() => void)) => {
      const [visit, setVisit] = React.useState(0);
      React.useEffect(() => {
        const comeBack = () => setVisit((count) => count + 1);
        mockFocus.returns.add(comeBack);
        return () => {
          mockFocus.returns.delete(comeBack);
        };
      }, []);
      React.useEffect(() => effect(), [effect, visit]);
    },
  };
});

type Response = { data: unknown; error: ApiError | null };

const mockRpc = jest.fn();

// Two screens are under test, and what the list learns of a letter opened from
// it - not the network. Only Supabase's client is replaced: the functions that
// list the letters and read one are the real ones.
jest.mock('@/lib/supabase', () => ({
  supabase: { rpc: (...args: unknown[]) => mockRpc(...args) },
}));

const NOW = new Date('2026-10-31T21:00:00Z').getTime();

const NO_CONNECTION = 'No connection. Check your network and try again.';

/** What supabase-js reports when a request never got an answer. */
const NETWORK_FAILURE: ApiError = { message: 'TypeError: Network request failed' };

/** From Anna in Hamburg, landed two hours ago and not opened yet, as the inbox lists it. */
const inboxRow = (overrides: Partial<InboxRow> = {}): InboxRow => ({
  message_id: 'letter-from-anna',
  sender_id: 'user-anna',
  sender_username: 'anna',
  sender_display_name: 'Anna Weber',
  origin_city_name: 'Hamburg',
  origin_country_code: 'DE',
  distance_km: 255.3,
  sent_at: '2026-10-31T15:48:00.000Z',
  arrived_at: '2026-10-31T19:00:00.000Z',
  opened_at: null,
  preview: 'Dear Mara,\n\nThe harbour was loud tonight.',
  ...overrides,
});

/** The same letter whole, as the server answers once it has marked it opened. */
const letterRow = (overrides: Partial<LetterRow> = {}): LetterRow => ({
  id: 'letter-from-anna',
  direction: 'received',
  other_id: 'user-anna',
  other_username: 'anna',
  other_display_name: 'Anna Weber',
  origin_city_name: 'Hamburg',
  origin_country_code: 'DE',
  destination_city_name: 'Berlin',
  destination_country_code: 'DE',
  distance_km: 255.3,
  sent_at: '2026-10-31T15:48:00.000Z',
  deliver_at: '2026-10-31T19:00:00.000Z',
  delivered: true,
  opened_at: '2026-10-31T21:00:00.000Z',
  body: 'Dear Mara,\n\nThe harbour was loud tonight.\n\nAnna',
  ...overrides,
});

/** What the server answers from now on, by the function asked. */
const server: { inbox: () => Response; letter: () => Response } = {
  inbox: () => ({ data: [], error: null }),
  letter: () => ({ data: null, error: NETWORK_FAILURE }),
};

/** How often each function has been asked so far. */
const asked = (name: string) => mockRpc.mock.calls.filter(([called]) => called === name).length;

/** Fixed insets so the screens render deterministically outside a device. */
const metrics: Metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

/**
 * The navigator in miniature: the list stays underneath, and a letter is on top
 * of it only while it is open.
 */
function Stack({ letterOpen }: { letterOpen: boolean }) {
  return (
    <SafeAreaProvider initialMetrics={metrics}>
      <View testID="list">
        <LettersScreen />
      </View>
      {letterOpen ? (
        <View testID="letter">
          <LetterScreen />
        </View>
      ) : null}
    </SafeAreaProvider>
  );
}

type Rendered = Awaited<ReturnType<typeof render>>;

/** Taps the letter's row and opens what the list asked the router for. */
async function openLetter(view: Rendered) {
  mockPush.mockClear();
  await fireEvent.press(screen.getByRole('button', { name: /Anna Weber/ }));

  const [route] = mockPush.mock.lastCall as [{ pathname: string; params: { id: string } }];
  expect(route.pathname).toBe('/letters/[id]');
  mockParams.id = route.params.id;
  await view.rerender(<Stack letterOpen />);
}

/** The header's arrow: the letter is removed, and the list is in front again. */
async function goBack(view: Rendered) {
  await view.rerender(<Stack letterOpen={false} />);
  await act(async () => mockFocus.returns.forEach((comeBack) => comeBack()));
}

const unreadMarks = () => screen.queryAllByLabelText('Unread');

/** Resolves once the letter is open: only an open letter can be answered. */
const letterOpened = () => screen.findByRole('button', { name: 'Write back' });

beforeEach(() => {
  jest.useFakeTimers({ now: NOW });
  mockPush.mockReset();
  mockParams.id = '';
  server.inbox = () => ({ data: [inboxRow()], error: null });
  server.letter = () => ({ data: letterRow(), error: null });
  mockRpc.mockReset();
  mockRpc.mockImplementation((name: string) => {
    if (name === 'read_message') return { single: () => Promise.resolve(server.letter()) };
    if (name === 'list_inbox') return Promise.resolve(server.inbox());
    throw new Error(`The test did not expect ${name} to be called.`);
  });
});

afterEach(() => {
  jest.useRealTimers();
});

describe('opening a letter from the list', () => {
  /**
   * The list used to take the mark off a letter the moment its row was tapped.
   * A letter that then could not be opened had lost it all the same, while the
   * server, and the roost's count, still had it as unread. (Found in review.)
   */
  it('keeps the unread mark on a letter that could not be opened', async () => {
    server.letter = () => ({ data: null, error: NETWORK_FAILURE });
    const view = await render(<Stack letterOpen={false} />);
    expect(await screen.findByLabelText('Unread')).toBeOnTheScreen();

    await openLetter(view);
    expect(await screen.findByText(NO_CONNECTION)).toBeOnTheScreen();
    await goBack(view);

    expect(screen.getByRole('button', { name: /Anna Weber/ })).toBeOnTheScreen();
    expect(unreadMarks()).toHaveLength(1);
  });

  it('takes the mark off once the letter has opened after all', async () => {
    server.letter = () => ({ data: null, error: NETWORK_FAILURE });
    const view = await render(<Stack letterOpen={false} />);
    await screen.findByLabelText('Unread');
    await openLetter(view);
    await screen.findByText(NO_CONNECTION);
    expect(unreadMarks()).toHaveLength(1);

    server.letter = () => ({ data: letterRow(), error: null });
    await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));

    expect(await letterOpened()).toBeOnTheScreen();
    expect(unreadMarks()).toHaveLength(0);
  });

  /**
   * The list asks the server again when it comes back into view, but only for
   * its newest hundred letters: one read farther down keeps whatever the list
   * held. Here the server goes on answering as before the letter was read,
   * which is what the list holds for such a letter.
   */
  it('shows a letter as read once it has been, whatever the list still holds for it', async () => {
    const view = await render(<Stack letterOpen={false} />);
    await screen.findByLabelText('Unread');

    await openLetter(view);
    await letterOpened();
    await goBack(view);

    expect(asked('list_inbox')).toBe(2);
    expect(asked('read_message')).toBe(1);
    expect(screen.getByRole('button', { name: /Anna Weber/ })).toBeOnTheScreen();
    expect(unreadMarks()).toHaveLength(0);
  });

  it('marks only the letter that was read', async () => {
    server.inbox = () => ({
      data: [
        inboxRow(),
        inboxRow({
          message_id: 'letter-from-ben',
          sender_id: 'user-ben',
          sender_username: 'ben',
          sender_display_name: 'Ben Okafor',
          arrived_at: '2026-10-31T18:00:00.000Z',
        }),
      ],
      error: null,
    });
    const view = await render(<Stack letterOpen={false} />);
    expect(await screen.findAllByLabelText('Unread')).toHaveLength(2);

    await openLetter(view);
    await letterOpened();
    await goBack(view);

    expect(unreadMarks()).toHaveLength(1);
  });
});

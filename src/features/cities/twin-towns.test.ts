import { describeCity } from '@/features/cities/search';
import { describeRoute, toFriendship, type FriendshipRow } from '@/features/friends/friends';
import {
  toLetter,
  toReceivedLetter,
  toSentLetter,
  type InboxRow,
  type LetterRow,
  type SentRow,
} from '@/features/messages/messages';

// What is mapped is under test, not Supabase's client; this keeps it off the
// network.
jest.mock('@/lib/supabase', () => ({ supabase: { rpc: jest.fn() } }));

/**
 * Two towns of one name in one country - the two Friedbergs in Germany - as
 * the database tells them apart: "near Frankfurt am Main" for the one in
 * Hessen, "near Augsburg" for the one in Bavaria. The picker showed it, and
 * nothing else did: a friend in Friedberg was "Friedberg, DE" in the friends
 * list, on their page, on the compose screen and on every letter. (Found in
 * review.) Each of those names a city with describeCity, from what these map.
 */

const friendRow = (overrides: Partial<FriendshipRow> = {}): FriendshipRow => ({
  friendship_id: 'friendship-anna',
  status: 'accepted',
  direction: 'outgoing',
  friend_id: 'anna-id',
  username: 'anna',
  display_name: 'Anna Weber',
  city_name: 'Friedberg',
  country_code: 'DE',
  city_qualifier: 'near Augsburg',
  distance_km: 47.2,
  flight_seconds: 2_124,
  requested_at: '2026-10-20T19:00:00.000Z',
  accepted_at: '2026-10-21T08:30:00.000Z',
  ...overrides,
});

const inboxRow: InboxRow = {
  message_id: 'letter-1',
  sender_id: 'anna-id',
  sender_username: 'anna',
  sender_display_name: 'Anna Weber',
  origin_city_name: 'Friedberg',
  origin_country_code: 'DE',
  origin_qualifier: 'near Frankfurt am Main',
  distance_km: 302.5,
  sent_at: '2026-10-30T18:00:00.000Z',
  arrived_at: '2026-10-30T21:47:00.000Z',
  opened_at: null,
  preview: 'Grüße aus der Wetterau.',
};

const sentRow: SentRow = {
  message_id: 'letter-2',
  recipient_id: 'ben-id',
  recipient_username: 'ben',
  recipient_display_name: 'Ben Huber',
  destination_city_name: 'Friedberg',
  destination_country_code: 'DE',
  destination_qualifier: 'near Augsburg',
  distance_km: 302.5,
  sent_at: '2026-10-31T18:00:00.000Z',
  deliver_at: '2026-10-31T21:47:00.000Z',
  delivered: false,
  preview: 'Grüße aus der Wetterau.',
};

const letterRow: LetterRow = {
  id: 'letter-2',
  direction: 'sent',
  other_id: 'ben-id',
  other_username: 'ben',
  other_display_name: 'Ben Huber',
  origin_city_name: 'Friedberg',
  origin_country_code: 'DE',
  origin_qualifier: 'near Frankfurt am Main',
  destination_city_name: 'Friedberg',
  destination_country_code: 'DE',
  destination_qualifier: 'near Augsburg',
  distance_km: 302.5,
  sent_at: '2026-10-31T18:00:00.000Z',
  deliver_at: '2026-10-31T21:47:00.000Z',
  delivered: false,
  opened_at: null,
  body: 'Grüße aus der Wetterau.',
};

describe('a town that shares its name with another in its country', () => {
  it('is told apart wherever a friend’s city is shown', () => {
    const friendship = toFriendship(friendRow());

    expect(friendship.friend.city).toEqual({
      name: 'Friedberg',
      countryCode: 'DE',
      qualifier: 'near Augsburg',
    });
    expect(describeRoute(friendship)).toMatch(/^Friedberg \(near Augsburg\), DE · /);
  });

  it('leaves a city whose name is its own as it was', () => {
    const friendship = toFriendship(
      friendRow({ city_name: 'Munich', city_qualifier: null, flight_seconds: 22_707 }),
    );

    expect(describeRoute(friendship)).toMatch(/^Munich, DE · /);
  });

  it('is told apart where a letter came from, and where one went', () => {
    expect(describeCity(toReceivedLetter(inboxRow).origin)).toBe(
      'Friedberg (near Frankfurt am Main), DE',
    );
    expect(describeCity(toSentLetter(sentRow).destination)).toBe('Friedberg (near Augsburg), DE');
  });

  it('is told apart at both ends of a letter that is opened', () => {
    const letter = toLetter(letterRow);

    expect(describeCity(letter.origin)).toBe('Friedberg (near Frankfurt am Main), DE');
    expect(describeCity(letter.destination)).toBe('Friedberg (near Augsburg), DE');
  });
});

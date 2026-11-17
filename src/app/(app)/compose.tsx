import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { FlightPath } from '@/components/flight-path';
import { FlyingBat } from '@/components/flying-bat';
import { ListRow } from '@/components/list-row';
import { Screen } from '@/components/screen';
import { Text } from '@/components/text';
import { TextField } from '@/components/text-field';
import { MESSAGE_MAX_LENGTH } from '@/constants/config';
import { Colors, Spacing } from '@/constants/theme';
import { useAuth } from '@/features/auth/auth-context';
import { describeCity } from '@/features/cities/search';
import {
  fetchFriendships,
  friendName,
  groupFriendships,
  type Friendship,
} from '@/features/friends/friends';
import { keepDraft, useDraft, useSend } from '@/features/messages/drafts';
import { letterLength, prepareBody, previewOf, validateBody } from '@/features/messages/messages';
import {
  askAfterLetterAt,
  onLetterOutcome,
  sendLetter,
  type Outcome,
} from '@/features/messages/sending';
import { useProfile } from '@/features/profile/use-profile';
import { countAtHome, fetchRoost, nextHomecoming, onRoostChanged } from '@/features/roost/roost';
import { announce } from '@/lib/announce';
import { flightProgress } from '@/lib/flight';
import {
  formatDistance,
  formatDuration,
  formatFlightEstimate,
  formatTimestamp,
} from '@/lib/format';
import { useNow } from '@/lib/use-now';
import { useRefreshAt } from '@/lib/use-refresh-at';
import { useRemote } from '@/lib/use-remote';
import { useScreenFocused } from '@/lib/use-screen-focused';

/** A letter that went, as the server answered for it. */
type Sent = Extract<Outcome, { kind: 'sent' }>;

/** Shown with the letter for as long as it is not known whether it went. */
const NOT_KNOWN =
  'No answer came back, so your letter may or may not have gone. ' +
  'Night Courier will check again by itself.';

/**
 * Writing a letter: choosing a friend, writing, and sending it by bat.
 *
 * The flight time shown before sending is the server's estimate, and the
 * arrival shown after is the server's answer. Nothing on this screen decides
 * how long a bat flies; it only reports it.
 *
 * Nor does the screen hold the letter. Its words, and how the sending of them
 * stands, are kept outside it (see drafts.ts and sending.ts), because both can
 * outlast it: the courier may leave half-way through a letter, or while the
 * button is still spinning.
 */
export default function ComposeScreen() {
  const router = useRouter();
  const { to } = useLocalSearchParams<{ to?: string }>();
  const { session } = useAuth();
  const courierId = session?.user.id;
  const { profile, error: profileError, reload: reloadProfile } = useProfile();
  const friendships = useRemote(fetchFriendships);
  const roost = useRemote(fetchRoost);
  const now = useNow(1000);
  const focused = useScreenFocused();

  // The words are kept outside this screen, one unsent letter for each friend,
  // so that leaving it - the back arrow, a swipe, going back to read again the
  // letter being answered - does not throw them away.
  const text = useDraft(courierId, to);
  // So is how the sending of them stands. A screen opened onto a letter that
  // is still on its way out shows it so, rather than offering to send it again.
  const { busy: sending, unanswered } = useSend(courierId, to);
  const [error, setError] = useState<string | null>(null);
  // Who it went to is kept with the answer, so the confirmation stays on screen
  // even if the friend list is fetched again behind it and has changed. `at` is
  // when the answer came.
  const [dispatched, setDispatched] = useState<{ sent: Sent; at: Date } | null>(null);
  // True while the profile is being loaded again because the courier asked.
  const [loadingProfile, setLoadingProfile] = useState(false);

  const friends = groupFriendships(friendships.data ?? []).friends;
  const recipient = to ? (friends.find((f) => f.friend.id === to) ?? null) : null;
  const name = recipient ? friendName(recipient.friend) : null;
  const city = recipient?.friend.city?.name ?? null;
  // While a move settles, letters still leave from the old city.
  const from = (profile?.move?.from ?? profile?.city)?.name ?? null;

  const bats = roost.data ?? [];
  const atHome = countAtHome(bats);
  const nextHomeAt = nextHomecoming(bats)?.getTime() ?? null;

  // A courier waiting here for a bat must be able to send the moment it lands,
  // without leaving the screen and losing what they wrote. Fetching the roost
  // again is what lands it.
  useRefreshAt(nextHomeAt, roost.settledAt, roost.reload);

  // And count them again whenever a send settles: the bat that left, with the
  // server's own time of leaving - or, after a refusal for want of a bat, a
  // roost that had been stale. Whichever letter it was: the courier may have
  // gone on to this one while the last was still on its way out.
  const { reload: reloadRoost, refresh: refreshRoost } = roost;
  useEffect(() => onRoostChanged(() => void reloadRoost()), [reloadRoost]);

  // What became of a send is told to every screen showing that letter: this
  // one, whether it pressed the button itself or was opened while the letter
  // was still on its way out.
  useEffect(
    () =>
      onLetterOutcome((courier, recipientId, outcome) => {
        if (courier !== courierId || recipientId !== to) return;
        if (outcome.kind === 'sent') {
          setDispatched({ sent: outcome, at: new Date() });
          announce(describeSent(outcome));
        } else if (outcome.kind === 'held') {
          setError(outcome.message);
        }
        // Not knowing needs no word here: the letter says so itself, below,
        // for as long as it lasts and on whichever screen shows it.
      }),
    [courierId, to],
  );

  // While it is not known whether the letter went, ask again without being
  // asked to, for as long as the letter is on screen. Each asking in vain sets
  // a later time to ask next, which is what keeps this going.
  const askAt = unanswered?.unknown ? unanswered.askAt : null;
  useEffect(() => {
    if (askAt === null || !courierId || !to || name === null) return;
    return askAfterLetterAt(askAt, courierId, { id: to, name, city, from });
  }, [askAt, courierId, to, name, city, from]);

  // Asks again for what this letter waits on, the bats and the profile, and
  // shows that it is asking. The screen has nothing to pull down, so without
  // this an error saying "try again" left only one way to do it: going back.
  // (Found in review.)
  async function loadAgain() {
    void refreshRoost();
    setLoadingProfile(true);
    try {
      await reloadProfile();
    } finally {
      setLoadingProfile(false);
    }
  }

  function send() {
    const problem = validateBody(text);
    setError(problem);
    if (problem || !courierId || !to || name === null) return;
    void sendLetter(courierId, { id: to, name, city, from });
  }

  if (dispatched) {
    const { to: went, dispatch, arrived, changed } = dispatched.sent;
    // When the letter left by the server's clock, from the roost fetched again
    // after sending; until then, when the answer came. A retried send is
    // answered with a letter that left earlier, and the drawing should agree
    // with the roost's. (Found in review.)
    const sentAt =
      roost.data?.find((bat) => bat.flight?.messageId === dispatch.id)?.flight?.sentAt ??
      dispatched.at;
    const remaining = dispatch.deliverAt.getTime() - now;
    const where = went.city ? ` in ${went.city}` : '';
    return (
      <Screen center scroll edges={['bottom']} style={styles.screen}>
        <FlyingBat
          size={120}
          tint={arrived ? Colors.batAvailable : Colors.batFlying}
          flying={focused && !arrived}
        />
        <Text variant="title" center style={styles.spaced}>
          {arrived ? 'Your letter has arrived' : 'Your bat is on its way'}
        </Text>
        <Text variant="body" tone="secondary" center style={styles.spaced}>
          {arrived
            ? `It has reached ${went.name}${where}. Landed ${formatTimestamp(dispatch.deliverAt)}.`
            : remaining > 0
              ? `It will reach ${went.name}${where} in ${formatDuration(remaining)}, at ${formatTimestamp(dispatch.deliverAt)}.`
              : `It is reaching ${went.name}${where} any moment now.`}
        </Text>
        {changed ? (
          <Text variant="body" tone="secondary" center style={styles.spaced}>
            It went as you first wrote it. What you changed since has not been sent. It is kept, in
            case you want to send it as a second letter.
          </Text>
        ) : null}
        <Text variant="caption" tone="muted" center style={styles.distance}>
          {formatDistance(dispatch.distanceKm)} as the bat flies.
        </Text>
        {went.from && went.city && !arrived ? (
          <View style={styles.path}>
            <FlightPath
              from={went.from}
              to={went.city}
              progress={flightProgress(sentAt, dispatch.deliverAt, now)}
              active={focused}
            />
          </View>
        ) : null}
        <View style={styles.actions}>
          {changed ? (
            <Button
              label="Back to what you wrote"
              variant="secondary"
              onPress={() => setDispatched(null)}
            />
          ) : null}
          <Button label="Back to the roost" onPress={() => router.dismissTo('/home')} />
        </View>
      </Screen>
    );
  }

  if (friendships.isLoading && !friendships.data) {
    return (
      <Screen center edges={['bottom']}>
        <ActivityIndicator color={Colors.textMuted} />
      </Screen>
    );
  }

  if (!to || !recipient) {
    return (
      <Screen scroll edges={['bottom']} style={styles.screen}>
        <Text variant="title">Who is it for?</Text>
        <Text variant="caption" tone="secondary" style={styles.lead}>
          The farther away a friend lives, the longer your bat flies.
        </Text>

        {to && friendships.data ? (
          <Text variant="caption" tone="danger" style={styles.spaced}>
            You can only write to friends. Choose one below.
          </Text>
        ) : null}

        {friendships.error && !friendships.data ? (
          <View style={styles.failed}>
            <Text variant="caption" tone="danger">
              {friendships.error}
            </Text>
            <Button
              label="Try again"
              variant="secondary"
              loading={friendships.isRefreshing}
              onPress={() => void friendships.refresh()}
            />
          </View>
        ) : null}

        {friendships.data && friends.length === 0 ? (
          <View style={styles.actions}>
            <Text variant="body" tone="secondary">
              You have no friends to write to yet.
            </Text>
            <Button label="Find friends" onPress={() => router.replace('/friends')} />
          </View>
        ) : null}

        {friends.length > 0 ? (
          <Card style={styles.list}>
            {friends.map((friendship) => (
              <FriendRow
                key={friendship.id}
                friendship={friendship}
                courierId={courierId}
                onPress={() => router.setParams({ to: friendship.friend.id })}
              />
            ))}
          </Card>
        ) : null}
      </Screen>
    );
  }

  const route = recipient.route;
  // Counted as it will be sent, which is what the limit is on: without the
  // blank space around it. Counted as typed, a letter of exactly the limit with
  // a new line after it showed a red "2001 / 2000" and went all the same.
  // (Found in review.)
  const length = letterLength(prepareBody(text));
  const tooLong = length > MESSAGE_MAX_LENGTH;
  // Only a courier known to have no city is held back here. A profile that
  // could not be loaded holds no letter back: the server knows where home is,
  // and refuses a sender without a city itself. (Found in review: one failed
  // request as the screen opened left "Send by bat" disabled until the screen
  // was left, and the letter with it.)
  const needsCity = profile !== null && !profile.city;
  const canSend = Boolean(route) && atHome > 0 && !needsCity && Boolean(profile || profileError);

  // One way out is enough when both the bats and the profile are missing. It
  // stands by the bats then, next to the button it is in the way of.
  const roostMissing = Boolean(roost.error) && !roost.data;
  const tryAgain = (
    <Button
      label="Try again"
      variant="secondary"
      loading={roost.isRefreshing || loadingProfile}
      onPress={() => void loadAgain()}
    />
  );

  // The only place that says why "Send by bat" might be disabled, so it must
  // say something in every state - while the bats are still being counted, and
  // when they could not be.
  let batLine: string;
  if (roost.data) {
    const remaining = nextHomeAt === null ? null : nextHomeAt - now;
    batLine =
      atHome > 0
        ? `${atHome} of ${bats.length} bats at home. This letter takes one; it comes back when the letter lands.`
        : remaining === null
          ? 'All your bats are out.'
          : remaining > 0
            ? `All your bats are out. The next one is home in ${formatDuration(remaining)}.`
            : 'All your bats are out. The next one is landing any moment now.';
  } else {
    batLine = roost.error ?? 'Counting your bats…';
  }

  return (
    <Screen scroll avoidKeyboard edges={['bottom']} style={styles.screen}>
      <Text variant="caption" tone="secondary">
        To
      </Text>
      <Text variant="title">{friendName(recipient.friend)}</Text>
      <Text variant="caption" tone="secondary" style={styles.lead}>
        {describeRoute(recipient)}
      </Text>
      {profile?.move ? (
        <Text variant="caption" tone="muted" style={styles.note}>
          Your bats still leave from {describeCity(profile.move.from)} until{' '}
          {formatTimestamp(profile.move.settlesAt)}, when your move settles.
        </Text>
      ) : null}

      {needsCity ? (
        <Text variant="caption" tone="danger" style={styles.spaced}>
          Choose your city first. Your bats need to know where home is.
        </Text>
      ) : !profile && profileError ? (
        <View style={styles.failed}>
          <Text variant="caption" tone="danger">
            {profileError}
          </Text>
          {roostMissing ? null : tryAgain}
        </View>
      ) : null}

      <View style={styles.form}>
        <TextField
          label="Your letter"
          value={text}
          onChangeText={(value) => {
            keepDraft(courierId, to, value);
            if (error) setError(null);
          }}
          error={error ?? (unanswered?.unknown ? NOT_KNOWN : null)}
          placeholder={`Dear ${friendName(recipient.friend)},`}
          // The request carries the words as they were when Send was pressed.
          // Anything typed while it is out would be neither sent nor kept.
          editable={!sending}
          multiline
          autoCapitalize="sentences"
          accessibilityHint={`Up to ${MESSAGE_MAX_LENGTH} characters.`}
        />
        <Text
          variant="caption"
          tone={tooLong ? 'danger' : 'muted'}
          style={styles.counter}
          accessibilityLabel={`${length} of ${MESSAGE_MAX_LENGTH} characters`}
        >
          {length} / {MESSAGE_MAX_LENGTH}
        </Text>

        <Text
          variant="caption"
          tone={roost.data ? (atHome > 0 ? 'muted' : 'flying') : roost.error ? 'danger' : 'muted'}
          style={styles.note}
        >
          {batLine}
        </Text>
        {roostMissing ? tryAgain : null}

        <Button label="Send by bat" loading={sending} disabled={!canSend} onPress={send} />
      </View>
    </Screen>
  );
}

/** The confirmation in one breath, for someone listening rather than looking. */
function describeSent({ to, dispatch, arrived, changed }: Sent): string {
  const went = arrived
    ? `Your letter to ${to.name} has arrived.`
    : `Your bat is on its way to ${to.name}. ` +
      `It lands in ${formatDuration(dispatch.deliverAt.getTime() - Date.now())}.`;
  return changed
    ? `${went} It went as you first wrote it; what you changed since has not been sent.`
    : went;
}

/**
 * A friend to choose, with the way there - and, if a letter to them was started
 * and not sent, how it begins. Opened with nobody chosen, the screen does not
 * go straight into such a letter, even when it is the only one: from there,
 * there would be no way to write to anyone else. It says where the words are
 * and leaves the choice to the courier.
 */
function FriendRow({
  friendship,
  courierId,
  onPress,
}: {
  friendship: Friendship;
  courierId: string | undefined;
  onPress: () => void;
}) {
  const started = previewOf(useDraft(courierId, friendship.friend.id));
  return (
    <ListRow
      title={friendName(friendship.friend)}
      subtitle={describeRoute(friendship)}
      detail={started ? `A letter you started: ${asOneLine(started)}` : undefined}
      disabled={!friendship.route}
      onPress={onPress}
    />
  );
}

/** A letter's opening run together, as the lists of letters show one. */
function asOneLine(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/** "Munich, DE · 505 km · about 6h 18m", or why no bat can go there. */
function describeRoute(friendship: Friendship): string {
  const { city } = friendship.friend;
  if (!city) return `@${friendship.friend.username} has not chosen a city yet`;
  if (!friendship.route) return describeCity(city);
  return [
    describeCity(city),
    formatDistance(friendship.route.distanceKm),
    formatFlightEstimate(friendship.route.flightSeconds),
  ].join(' · ');
}

const styles = StyleSheet.create({
  screen: { paddingTop: Spacing.sm, paddingBottom: Spacing.xl },
  lead: { marginTop: Spacing.xs, lineHeight: 19 },
  spaced: { marginTop: Spacing.md },
  failed: { marginTop: Spacing.md, gap: Spacing.sm },
  list: { marginTop: Spacing.lg, paddingVertical: Spacing.xs, paddingHorizontal: Spacing.xs },
  form: { gap: Spacing.sm, marginTop: Spacing.lg },
  counter: { alignSelf: 'flex-end' },
  distance: { marginTop: Spacing.sm },
  path: { alignSelf: 'stretch', marginTop: Spacing.lg },
  note: { lineHeight: 19 },
  actions: { alignSelf: 'stretch', gap: Spacing.sm, marginTop: Spacing.xl },
});

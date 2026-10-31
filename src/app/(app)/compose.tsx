import { useLocalSearchParams, useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, StyleSheet, View } from 'react-native';

import { BatMark } from '@/components/bat-mark';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { ListRow } from '@/components/list-row';
import { Screen } from '@/components/screen';
import { Text } from '@/components/text';
import { TextField } from '@/components/text-field';
import { MESSAGE_MAX_LENGTH } from '@/constants/config';
import { Colors, Spacing } from '@/constants/theme';
import { describeCity } from '@/features/cities/search';
import {
  fetchFriendships,
  friendName,
  groupFriendships,
  type Friendship,
} from '@/features/friends/friends';
import {
  letterLength,
  sendMessage,
  validateBody,
  type Dispatch,
} from '@/features/messages/messages';
import { useProfile } from '@/features/profile/use-profile';
import { countAtHome, fetchRoost, nextHomecoming } from '@/features/roost/roost';
import {
  formatDistance,
  formatDuration,
  formatFlightEstimate,
  formatTimestamp,
} from '@/lib/format';
import { messageOf } from '@/lib/rpc-error';
import { useNow } from '@/lib/use-now';
import { useRemote } from '@/lib/use-remote';

/**
 * Writing a letter: choosing a friend, writing, and sending it by bat.
 *
 * The flight time shown before sending is the server's estimate, and the
 * arrival shown after is the server's answer. Nothing on this screen decides
 * how long a bat flies; it only reports it.
 */
export default function ComposeScreen() {
  const router = useRouter();
  const { to } = useLocalSearchParams<{ to?: string }>();
  const { profile } = useProfile();
  const friendships = useRemote(fetchFriendships);
  const roost = useRemote(fetchRoost);
  const now = useNow(1000);

  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [dispatched, setDispatched] = useState<Dispatch | null>(null);
  // The button disables itself while loading, but a second tap can land in the
  // same frame as the first. A letter costs a bat; this makes sure it is one.
  const inFlight = useRef(false);

  const friends = groupFriendships(friendships.data ?? []).friends;
  const recipient = to ? (friends.find((f) => f.friend.id === to) ?? null) : null;

  const bats = roost.data ?? [];
  const atHome = countAtHome(bats);
  const nextHomeAt = nextHomecoming(bats)?.getTime() ?? null;

  async function send(friendship: Friendship) {
    if (inFlight.current) return;
    const problem = validateBody(text);
    setError(problem);
    if (problem) return;

    inFlight.current = true;
    setSending(true);
    try {
      const dispatch = await sendMessage(friendship.friend.id, text);
      setDispatched(dispatch);
      setText('');
    } catch (caught) {
      setError(messageOf(caught));
      // A refusal for want of a bat means the roost on screen was stale.
      void roost.reload();
    } finally {
      inFlight.current = false;
      setSending(false);
    }
  }

  if (dispatched && recipient) {
    return (
      <Screen center scroll edges={['bottom']} style={styles.screen}>
        <BatMark size={120} tint={Colors.batFlying} />
        <Text variant="title" center style={styles.spaced}>
          Your bat is on its way
        </Text>
        <Text variant="body" tone="secondary" center style={styles.spaced}>
          It will reach {friendName(recipient.friend)}
          {recipient.friend.city ? ` in ${recipient.friend.city.name}` : ''} in{' '}
          {formatDuration(dispatched.deliverAt.getTime() - now)}, at{' '}
          {formatTimestamp(dispatched.deliverAt)}.
        </Text>
        <Text variant="caption" tone="muted" center>
          {formatDistance(dispatched.distanceKm)} as the bat flies.
        </Text>
        <View style={styles.actions}>
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
          <Text variant="caption" tone="danger" style={styles.spaced}>
            {friendships.error}
          </Text>
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
              <ListRow
                key={friendship.id}
                title={friendName(friendship.friend)}
                subtitle={describeRoute(friendship)}
                disabled={!friendship.route}
                onPress={() => router.setParams({ to: friendship.friend.id })}
              />
            ))}
          </Card>
        ) : null}
      </Screen>
    );
  }

  const route = recipient.route;
  const length = letterLength(text);
  const tooLong = length > MESSAGE_MAX_LENGTH;
  const canSend = Boolean(route) && Boolean(profile?.city) && atHome > 0;

  let batLine: string | null = null;
  if (roost.data) {
    batLine =
      atHome > 0
        ? `${atHome} of ${bats.length} bats at home. This letter takes one; it comes back when the letter lands.`
        : nextHomeAt !== null
          ? `All your bats are out. The next one is home in ${formatDuration(nextHomeAt - now)}.`
          : 'All your bats are out.';
  }

  return (
    <Screen scroll edges={['bottom']} style={styles.screen}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Text variant="caption" tone="secondary">
          To
        </Text>
        <Text variant="title">{friendName(recipient.friend)}</Text>
        <Text variant="caption" tone="secondary" style={styles.lead}>
          {describeRoute(recipient)}
        </Text>

        {profile && !profile.city ? (
          <Text variant="caption" tone="danger" style={styles.spaced}>
            Choose your city first. Your bats need to know where home is.
          </Text>
        ) : null}

        <View style={styles.form}>
          <TextField
            label="Your letter"
            value={text}
            onChangeText={(value) => {
              setText(value);
              if (error) setError(null);
            }}
            error={error}
            placeholder={`Dear ${friendName(recipient.friend)},`}
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

          {batLine ? (
            <Text variant="caption" tone={atHome > 0 ? 'muted' : 'flying'} style={styles.note}>
              {batLine}
            </Text>
          ) : null}

          <Button
            label="Send by bat"
            loading={sending}
            disabled={!canSend}
            onPress={() => void send(recipient)}
          />
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
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
  list: { marginTop: Spacing.lg, paddingVertical: Spacing.xs, paddingHorizontal: Spacing.xs },
  form: { gap: Spacing.sm, marginTop: Spacing.lg },
  counter: { alignSelf: 'flex-end' },
  note: { lineHeight: 19 },
  actions: { alignSelf: 'stretch', gap: Spacing.sm, marginTop: Spacing.xl },
});
